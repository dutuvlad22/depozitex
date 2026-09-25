-- ============================================================
-- DepoziteX — pick pe mai multe locatii + verificare prin scanare
-- 1) Fix: la "Preia la pick" (nou -> de_pregatit), stocul unui produs
--    poate fi acum preluat din MAI MULTE locatii daca e nevoie (nu mai
--    esueaza cu "stoc insuficient" cand suma pe mai multe locatii
--    ajunge, dar nicio locatie singura nu are destul). Stocul se
--    scade in continuare imediat la acest pas (ca inainte) — asta
--    "rezerva" marfa pentru comanda.
-- 2) Nou: order_pick_lines tine minte EXACT de unde s-a alocat
--    fiecare bucata (produs + locatie + cantitate), ca:
--    a) angajatul sa poata scana bucatile la pregatire si sa se
--       verifice ca a luat ce trebuie (fara sa mai atinga stocul —
--       stocul e deja corect din pasul 1)
--    b) delete_order sa poata restitui stocul in locatiile EXACTE
--       din care a fost luat (nu "prima locatie gasita", ca inainte)
-- Rulare: Supabase -> SQL Editor -> New query -> paste -> Run
-- Idempotent: poti rula scriptul de mai multe ori fara erori.
-- ============================================================

-- 1. Alocarea de pick, per locatie sursa
create table if not exists public.order_pick_lines (
  id              uuid primary key default gen_random_uuid(),
  order_line_id   uuid not null references public.order_lines(id) on delete cascade,
  location_id     uuid not null references public.locations(id),
  quantity        integer not null check (quantity > 0),   -- alocat/scazut din stoc la acest pas
  picked_quantity integer not null default 0                -- scanat efectiv de angajat
);
create index if not exists idx_order_pick_lines_order_line_id on public.order_pick_lines (order_line_id);

alter table public.order_pick_lines enable row level security;

drop policy if exists p_order_pick_lines on public.order_pick_lines;
create policy p_order_pick_lines on public.order_pick_lines for all
using (
  exists (
    select 1 from public.order_lines ol
    join public.orders o on o.id = ol.order_id
    where ol.id = order_line_id and public.is_member(o.organization_id)
  )
)
with check (
  exists (
    select 1 from public.order_lines ol
    join public.orders o on o.id = ol.order_id
    where ol.id = order_line_id and public.is_member(o.organization_id)
  )
);

-- 2. advance_order: 'nou' aloca acum pe (posibil) mai multe locatii;
--    'de_pregatit' nu mai avanseaza direct (se face prin
--    finalize_pick, dupa verificarea prin scanare); 'ambalat' neschimbat.
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
  v_awb       text;
  v_courier   text;
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

    update public.orders set status = 'de_pregatit' where id = p_order_id;

  elsif v_status = 'de_pregatit' then
    raise exception 'Foloseste verificarea prin scanare pentru a finaliza pregatirea comenzii.';

  elsif v_status = 'ambalat' then
    v_awb := 'AWB' || floor(random() * 900000000 + 100000000)::text;
    v_courier := (array['Econt','Sameday','Cargus','FAN Courier'])[floor(random() * 4 + 1)];

    insert into public.shipments (organization_id, order_id, awb, courier, status, shipped_at)
    values (v_org, p_order_id, v_awb, v_courier, 'expediat', now());

    update public.orders set status = 'expediat' where id = p_order_id;

  else
    raise exception 'Comanda nu mai poate avansa din statusul curent.';
  end if;
end;
$$;

grant execute on function public.advance_order(uuid) to authenticated;

-- 3. Scanare pick: +1/-1 pe cantitatea scanata a unei linii de alocare,
--    plafonata la cat s-a alocat (nu poate depasi). Blocata daca
--    comanda nu mai e in "de_pregatit".
create or replace function public.scan_pick_line(p_pick_line_id uuid, p_delta integer default 1)
returns public.order_pick_lines
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status order_status;
  v_row    public.order_pick_lines;
begin
  select o.status into v_status
  from public.order_pick_lines opl
  join public.order_lines ol on ol.id = opl.order_line_id
  join public.orders o on o.id = ol.order_id
  where opl.id = p_pick_line_id;

  if v_status is null then
    raise exception 'Linia de pick nu exista.';
  end if;
  if v_status <> 'de_pregatit' then
    raise exception 'Comanda nu mai este in verificare.';
  end if;

  update public.order_pick_lines
  set picked_quantity = greatest(0, least(quantity, picked_quantity + p_delta))
  where id = p_pick_line_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.scan_pick_line(uuid, integer) to authenticated;

-- 4. Finalizare pregatire: aduna scanarile pe order_lines.picked_quantity
--    (doar pentru afisare/audit — stocul e deja corect din pasul 1) si
--    avanseaza comanda la 'ambalat'. Discrepantele sunt permise.
create or replace function public.finalize_pick(p_order_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status order_status;
begin
  select status into v_status from public.orders where id = p_order_id;

  if v_status is null then
    raise exception 'Comanda nu exista.';
  end if;
  if v_status <> 'de_pregatit' then
    raise exception 'Comanda nu este in verificare.';
  end if;

  update public.order_lines ol
  set picked_quantity = coalesce((
    select sum(opl.picked_quantity) from public.order_pick_lines opl where opl.order_line_id = ol.id
  ), 0)
  where ol.order_id = p_order_id;

  update public.orders set status = 'ambalat' where id = p_order_id;
end;
$$;

grant execute on function public.finalize_pick(uuid) to authenticated;

-- 5. delete_order: restituie stocul in locatiile EXACTE din care a
--    fost alocat (order_pick_lines), nu mai "ghiceste" o locatie.
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
  end loop;

  delete from public.orders where id = p_order_id;
end;
$$;

grant execute on function public.delete_order(uuid) to authenticated;
