-- ============================================================
-- DepoziteX — picking cu atribuire automata
-- 1) orders.assigned_to / assigned_at: pickerul care pregateste comanda
-- 2) advance_order: blocheaza randurile de stoc cand aloca (FOR UPDATE).
--    Inainte, doi pickeri care alocau simultan acelasi produs puteau
--    citi aceeasi cantitate si duce stocul pe minus. In plus, cine preia
--    comanda (nou -> de_pregatit) devine pickerul ei.
-- 3) claim_next_order: butonul "Urmatoarea comanda" al pickerului:
--    a) comanda pe care o are deja inceputa (una singura odata)
--    b) altfel o comanda eliberata de admin (deja alocata, fara picker)
--    c) altfel cea mai veche comanda noua care are tot stocul disponibil
--    Doi pickeri nu pot primi aceeasi comanda (FOR UPDATE SKIP LOCKED).
-- 4) release_order: adminul elibereaza o comanda (ex. pickerul a plecat);
--    alocarea si scanarile raman, urmatorul picker continua de unde a ramas.
-- Rulare: ./sql/apply.sh test sql/14_picking.sql (apoi prod)
-- Idempotent: poti rula scriptul de mai multe ori fara erori.
-- ============================================================

-- 1. picker pe comanda
alter table public.orders add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
alter table public.orders add column if not exists assigned_at timestamptz;
create index if not exists idx_orders_picking_queue
  on public.orders (organization_id, status, created_at) where assigned_to is null;

-- 2. advance_order (ca in 09) + blocare stoc + picker
create or replace function public.advance_order(p_order_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status    order_status;
  v_org       uuid;
  v_line      record;
  v_loc       record;
  v_remaining integer;
  v_take      integer;
begin
  select status, organization_id into v_status, v_org from public.orders where id = p_order_id;

  if v_status is null then
    raise exception 'Comanda nu exista.';
  end if;

  if v_status = 'nou' then
    for v_line in select ol.id, ol.product_id, ol.quantity from public.order_lines ol where ol.order_id = p_order_id
    loop
      v_remaining := v_line.quantity;

      for v_loc in
        select id, location_id, quantity
        from public.inventory
        where product_id = v_line.product_id and quantity > 0
        order by quantity desc
        for update   -- alocarile simultane asteapta una dupa alta si vad cantitatea actualizata
      loop
        exit when v_remaining <= 0;
        v_take := least(v_remaining, v_loc.quantity);

        update public.inventory set quantity = quantity - v_take, updated_at = now() where id = v_loc.id;

        insert into public.order_pick_lines (order_line_id, location_id, quantity)
        values (v_line.id, v_loc.location_id, v_take);

        insert into public.stock_movements
          (organization_id, product_id, location_id, quantity_change, movement_type, reference_type, reference_id, created_by)
        values
          (v_org, v_line.product_id, v_loc.location_id, -v_take, 'pick', 'order', p_order_id, auth.uid());

        v_remaining := v_remaining - v_take;
      end loop;

      if v_remaining > 0 then
        raise exception 'Stoc insuficient pentru unul dintre produsele comenzii.';
      end if;
    end loop;

    update public.orders
    set status = 'de_pregatit',
        assigned_to = coalesce(assigned_to, auth.uid()),
        assigned_at = coalesce(assigned_at, now())
    where id = p_order_id;

  elsif v_status = 'de_pregatit' then
    raise exception 'Foloseste verificarea prin scanare pentru a finaliza pregatirea comenzii.';

  elsif v_status = 'ambalat' then
    raise exception 'Foloseste ecranul comenzii pentru a genera AWB-ul.';

  else
    raise exception 'Comanda nu mai poate avansa din statusul curent.';
  end if;
end;
$$;

grant execute on function public.advance_order(uuid) to authenticated;

-- 3. urmatoarea comanda pentru picker
create or replace function public.claim_next_order(p_organization_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_id   uuid;
  v_cand record;
begin
  if v_uid is null or not public.is_member(p_organization_id) then
    raise exception 'Acces interzis.';
  end if;

  -- a) comanda deja inceputa
  select id into v_id
  from public.orders
  where organization_id = p_organization_id and status = 'de_pregatit' and assigned_to = v_uid
  order by assigned_at, created_at
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  -- b) comanda eliberata (stocul e deja alocat)
  select id into v_id
  from public.orders
  where organization_id = p_organization_id and status = 'de_pregatit' and assigned_to is null
  order by created_at
  limit 1
  for update skip locked;
  if v_id is not null then
    update public.orders set assigned_to = v_uid, assigned_at = now() where id = v_id;
    return v_id;
  end if;

  -- c) cea mai veche comanda noua cu tot stocul disponibil
  for v_cand in
    select id
    from public.orders
    where organization_id = p_organization_id and status = 'nou' and assigned_to is null
    order by created_at
    limit 200
  loop
    -- blocam doar comanda incercata; daca alt picker o proceseaza chiar acum, trecem mai departe
    select id into v_id
    from public.orders
    where id = v_cand.id and status = 'nou' and assigned_to is null
    for update skip locked;
    continue when v_id is null;

    if exists (
      select 1
      from (select product_id, sum(quantity) as q from public.order_lines
            where order_id = v_cand.id group by product_id) need
      left join (select product_id, sum(quantity) as q from public.inventory
                 where organization_id = p_organization_id group by product_id) have
        using (product_id)
      where coalesce(have.q, 0) < need.q
    ) then
      continue;
    end if;

    begin
      perform public.advance_order(v_cand.id);   -- aloca stocul si seteaza pickerul
      return v_cand.id;
    exception when raise_exception then
      -- stocul a fost luat intre timp de alt picker: incearca urmatoarea comanda
      null;
    end;
  end loop;

  return null;
end;
$$;

grant execute on function public.claim_next_order(uuid) to authenticated;

-- 4. eliberare comanda (admin)
create or replace function public.release_order(p_order_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org    uuid;
  v_status order_status;
begin
  select organization_id, status into v_org, v_status from public.orders where id = p_order_id;
  if v_org is null then
    raise exception 'Comanda nu exista.';
  end if;
  if not public.is_admin(v_org) then
    raise exception 'Doar administratorii pot elibera comenzi.';
  end if;
  if v_status <> 'de_pregatit' then
    raise exception 'Doar comenzile aflate in pregatire pot fi eliberate.';
  end if;

  update public.orders set assigned_to = null, assigned_at = null where id = p_order_id;
end;
$$;

grant execute on function public.release_order(uuid) to authenticated;
