-- ============================================================
-- DepoziteX — rapoarte
-- 1) report_client_activity: activitate per client pe o perioada
--    (baza pentru facturare)
-- 2) report_stock: stoc la zi per produs, cu locatii si ultima miscare
-- 3) stock_movements_report: jurnal miscari cu nume lizibile (view)
-- 4) report_performance_daily / report_performance_summary:
--    comenzi primite/expediate pe zi si timpul pana la expediere
-- 5) delete_order scrie acum si in stock_movements (inainte restituia
--    stocul fara urma in jurnal, deci jurnalul nu explica stocul)
--
-- Agregarile se fac aici, nu in aplicatie: API-ul intoarce maxim 1000
-- de randuri pe cerere, iar un total calculat din randuri trunchiate
-- ar fi gresit fara nicio eroare.
-- Toate functiile sunt security invoker: RLS-ul existent se aplica,
-- plus verificarea explicita is_member pe organizatia ceruta.
-- Perioadele sunt zile calendaristice in ora Romaniei, capete incluse.
-- Rulare: ./sql/apply.sh test sql/11_rapoarte.sql (apoi prod)
-- Idempotent: poti rula scriptul de mai multe ori fara erori.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Activitate per client
-- ------------------------------------------------------------
create or replace function public.report_client_activity(
  p_organization_id uuid,
  p_from date,
  p_to date
)
returns table (
  client_id        uuid,
  client_name      text,
  orders_received  bigint,
  orders_shipped   bigint,
  units_shipped    bigint,
  receipts_count   bigint,
  units_received   bigint,
  returns_count    bigint,
  units_returned   bigint,
  units_in_stock   bigint   -- stocul clientului la sfarsitul perioadei
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_from timestamptz := p_from::timestamp at time zone 'Europe/Bucharest';
  v_to   timestamptz := (p_to + 1)::timestamp at time zone 'Europe/Bucharest';
begin
  if not public.is_member(p_organization_id) then
    raise exception 'Acces interzis.';
  end if;

  return query
  with
  received as (
    select o.client_id, count(*) as n
    from orders o
    where o.organization_id = p_organization_id
      and o.created_at >= v_from and o.created_at < v_to
    group by o.client_id
  ),
  shipped as (
    select o.client_id,
           count(distinct o.id) as n,
           coalesce(sum(ol.quantity), 0) as units
    from shipments s
    join orders o on o.id = s.order_id
    left join order_lines ol on ol.order_id = o.id
    where s.organization_id = p_organization_id
      and s.shipped_at >= v_from and s.shipped_at < v_to
    group by o.client_id
  ),
  movements as (
    select p.client_id,
           count(distinct m.reference_id)
             filter (where m.movement_type = 'receptie' and m.created_at < v_to) as receipts,
           coalesce(sum(m.quantity_change)
             filter (where m.movement_type = 'receptie' and m.created_at < v_to), 0) as units_in,
           -- stocul de acum minus tot ce s-a miscat dupa perioada = stocul la final de perioada
           coalesce(sum(m.quantity_change) filter (where m.created_at >= v_to), 0) as after_period
    from stock_movements m
    join products p on p.id = m.product_id
    where m.organization_id = p_organization_id
      and m.created_at >= v_from
    group by p.client_id
  ),
  rets as (
    select p.client_id, count(*) as n, coalesce(sum(r.quantity), 0) as units
    from returns r
    join products p on p.id = r.product_id
    where r.organization_id = p_organization_id
      and r.created_at >= v_from and r.created_at < v_to
    group by p.client_id
  ),
  stock_now as (
    select p.client_id, coalesce(sum(i.quantity), 0) as units
    from inventory i
    join products p on p.id = i.product_id
    where i.organization_id = p_organization_id
    group by p.client_id
  )
  select c.id,
         c.name,
         coalesce(rc.n, 0)::bigint,
         coalesce(sh.n, 0)::bigint,
         coalesce(sh.units, 0)::bigint,
         coalesce(mv.receipts, 0)::bigint,
         coalesce(mv.units_in, 0)::bigint,
         coalesce(rt.n, 0)::bigint,
         coalesce(rt.units, 0)::bigint,
         (coalesce(sn.units, 0) - coalesce(mv.after_period, 0))::bigint
  from clients c
  left join received  rc on rc.client_id = c.id
  left join shipped   sh on sh.client_id = c.id
  left join movements mv on mv.client_id = c.id
  left join rets      rt on rt.client_id = c.id
  left join stock_now sn on sn.client_id = c.id
  where c.organization_id = p_organization_id
  order by c.name;
end;
$$;

grant execute on function public.report_client_activity(uuid, date, date) to authenticated;

-- ------------------------------------------------------------
-- 2. Stoc la zi per produs
-- ------------------------------------------------------------
create or replace function public.report_stock(
  p_organization_id uuid,
  p_client_id uuid default null
)
returns table (
  product_id       uuid,
  client_id        uuid,
  client_name      text,
  sku              text,
  product_name     text,
  quantity         bigint,
  reorder_point    integer,
  locations        text,         -- ex. "A-01-02 (5), B-03 (2)"
  last_movement_at timestamptz,
  status           text          -- ok | scazut | epuizat
)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if not public.is_member(p_organization_id) then
    raise exception 'Acces interzis.';
  end if;

  return query
  with inv as (
    select i.product_id,
           sum(i.quantity) as qty,
           string_agg(l.code || ' (' || i.quantity || ')', ', ' order by l.code)
             filter (where i.quantity > 0) as locs
    from inventory i
    join locations l on l.id = i.location_id
    where i.organization_id = p_organization_id
    group by i.product_id
  ),
  last_mv as (
    select m.product_id, max(m.created_at) as at
    from stock_movements m
    where m.organization_id = p_organization_id
    group by m.product_id
  )
  select p.id,
         c.id,
         c.name,
         p.sku,
         p.name,
         coalesce(inv.qty, 0)::bigint,
         p.reorder_point,
         coalesce(inv.locs, ''),
         lm.at,
         case
           when coalesce(inv.qty, 0) <= 0 then 'epuizat'
           when coalesce(inv.qty, 0) <= p.reorder_point then 'scazut'
           else 'ok'
         end
  from products p
  join clients c on c.id = p.client_id
  left join inv on inv.product_id = p.id
  left join last_mv lm on lm.product_id = p.id
  where p.organization_id = p_organization_id
    and (p_client_id is null or p.client_id = p_client_id)
  order by c.name, p.sku;
end;
$$;

grant execute on function public.report_stock(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- 3. Jurnal miscari stoc (view cu nume lizibile)
--    security_invoker: RLS-ul tabelelor se aplica userului care citeste
-- ------------------------------------------------------------
create or replace view public.stock_movements_report
with (security_invoker = true) as
select m.id,
       m.organization_id,
       m.created_at,
       m.movement_type,
       m.quantity_change,
       m.reference_type,
       m.reference_id,
       case m.reference_type
         when 'order'         then coalesce(o.order_no, 'comanda stearsa')
         when 'order_deleted' then 'comanda stearsa'
         when 'receipt'       then coalesce(r.reference, 'fara referinta')
         when 'return'        then 'retur'
         else m.reference_type
       end as reference_label,
       p.id   as product_id,
       p.sku,
       p.name as product_name,
       c.id   as client_id,
       c.name as client_name,
       l.code as location_code,
       w.name as warehouse_name,
       pr.email as created_by_email
from stock_movements m
join products p        on p.id = m.product_id
join clients c         on c.id = p.client_id
left join locations l  on l.id = m.location_id
left join warehouses w on w.id = l.warehouse_id
left join orders o     on m.reference_type = 'order'   and o.id = m.reference_id
left join receipts r   on m.reference_type = 'receipt' and r.id = m.reference_id
left join profiles pr  on pr.id = m.created_by;

grant select on public.stock_movements_report to authenticated;

create index if not exists idx_stock_movements_org_created
  on stock_movements (organization_id, created_at desc);

-- ------------------------------------------------------------
-- 4. Performanta operationala
-- ------------------------------------------------------------
create or replace function public.report_performance_daily(
  p_organization_id uuid,
  p_from date,
  p_to date
)
returns table (
  day                date,
  orders_received    bigint,
  orders_shipped     bigint,
  units_shipped      bigint,
  avg_hours_to_ship  numeric   -- media (creare comanda -> expediere) pentru comenzile expediate in ziua respectiva
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_from timestamptz := p_from::timestamp at time zone 'Europe/Bucharest';
  v_to   timestamptz := (p_to + 1)::timestamp at time zone 'Europe/Bucharest';
begin
  if not public.is_member(p_organization_id) then
    raise exception 'Acces interzis.';
  end if;

  return query
  with days as (
    select d::date as day from generate_series(p_from, p_to, interval '1 day') d
  ),
  rec as (
    select (o.created_at at time zone 'Europe/Bucharest')::date as day, count(*) as n
    from orders o
    where o.organization_id = p_organization_id
      and o.created_at >= v_from and o.created_at < v_to
    group by 1
  ),
  shp as (
    select (s.shipped_at at time zone 'Europe/Bucharest')::date as day,
           count(*) as n,
           avg(extract(epoch from (s.shipped_at - o.created_at)) / 3600) as avg_h
    from shipments s
    join orders o on o.id = s.order_id
    where s.organization_id = p_organization_id
      and s.shipped_at >= v_from and s.shipped_at < v_to
    group by 1
  ),
  units as (
    select (s.shipped_at at time zone 'Europe/Bucharest')::date as day, sum(ol.quantity) as u
    from shipments s
    join order_lines ol on ol.order_id = s.order_id
    where s.organization_id = p_organization_id
      and s.shipped_at >= v_from and s.shipped_at < v_to
    group by 1
  )
  select d.day,
         coalesce(rec.n, 0)::bigint,
         coalesce(shp.n, 0)::bigint,
         coalesce(units.u, 0)::bigint,
         round(shp.avg_h::numeric, 1)
  from days d
  left join rec   on rec.day = d.day
  left join shp   on shp.day = d.day
  left join units on units.day = d.day
  order by d.day;
end;
$$;

grant execute on function public.report_performance_daily(uuid, date, date) to authenticated;

create or replace function public.report_performance_summary(
  p_organization_id uuid,
  p_from date,
  p_to date
)
returns table (
  orders_received     bigint,
  orders_shipped      bigint,
  median_hours        numeric,
  p90_hours           numeric,
  shipped_within_24h  numeric   -- procent din comenzile expediate in perioada
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_from timestamptz := p_from::timestamp at time zone 'Europe/Bucharest';
  v_to   timestamptz := (p_to + 1)::timestamp at time zone 'Europe/Bucharest';
begin
  if not public.is_member(p_organization_id) then
    raise exception 'Acces interzis.';
  end if;

  return query
  with shp as (
    select extract(epoch from (s.shipped_at - o.created_at)) / 3600 as h
    from shipments s
    join orders o on o.id = s.order_id
    where s.organization_id = p_organization_id
      and s.shipped_at >= v_from and s.shipped_at < v_to
  )
  select (select count(*) from orders o
          where o.organization_id = p_organization_id
            and o.created_at >= v_from and o.created_at < v_to)::bigint,
         (select count(*) from shp)::bigint,
         (select round((percentile_cont(0.5) within group (order by h))::numeric, 1) from shp),
         (select round((percentile_cont(0.9) within group (order by h))::numeric, 1) from shp),
         (select round(100.0 * count(*) filter (where h <= 24) / nullif(count(*), 0), 0) from shp);
end;
$$;

grant execute on function public.report_performance_summary(uuid, date, date) to authenticated;

-- ------------------------------------------------------------
-- 5. delete_order: la fel ca in 08, plus o miscare 'ajustare' in jurnal
--    pentru fiecare cantitate restituita in stoc
-- ------------------------------------------------------------
create or replace function public.delete_order(p_order_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org  uuid;
  v_line record;
begin
  select organization_id into v_org from public.orders where id = p_order_id;
  if v_org is null then
    raise exception 'Comanda nu exista.';
  end if;
  if not public.is_admin(v_org) then
    raise exception 'Doar administratorii pot sterge comenzi.';
  end if;

  for v_line in
    select ol.product_id, opl.location_id, opl.quantity
    from public.order_pick_lines opl
    join public.order_lines ol on ol.id = opl.order_line_id
    where ol.order_id = p_order_id
  loop
    update public.inventory
    set quantity = quantity + v_line.quantity, updated_at = now()
    where product_id = v_line.product_id and location_id = v_line.location_id;

    insert into public.stock_movements
      (organization_id, product_id, location_id, quantity_change, movement_type, reference_type, reference_id, created_by)
    values
      (v_org, v_line.product_id, v_line.location_id, v_line.quantity, 'ajustare', 'order_deleted', p_order_id, auth.uid());
  end loop;

  delete from public.orders where id = p_order_id;
end;
$$;

grant execute on function public.delete_order(uuid) to authenticated;
