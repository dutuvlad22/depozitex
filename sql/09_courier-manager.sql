-- ============================================================
-- DepoziteX — integrare Courier Manager (pilot minim)
-- 1) Date destinatar + colet pe orders (lipseau complet)
-- 2) courier_manager_settings: cheia API per organizatie (RLS admin-only)
-- 3) Extindere shipments (deja existent) cu raspuns brut/eroare/audit
-- 4) advance_order: elimin generarea automata de AWB fals; "de_pregatit"
--    si "ambalat" au acum fluxuri dedicate (verificare scanare, respectiv
--    generare AWB real din ecranul comenzii)
-- 5) courier_record_shipment: scrie atomic randul din shipments si trece
--    comanda pe "expediat" cand AWB-ul a fost generat cu succes
-- Rulare: Supabase -> SQL Editor -> New query -> paste -> Run
-- Idempotent: poti rula scriptul de mai multe ori fara erori.
-- ============================================================

-- 1. Date destinatar + colet
alter table public.orders add column if not exists recipient_name text;
alter table public.orders add column if not exists recipient_phone text;
alter table public.orders add column if not exists address_street text;
alter table public.orders add column if not exists address_number text;
alter table public.orders add column if not exists city text;
alter table public.orders add column if not exists county text;
alter table public.orders add column if not exists postal_code text;
alter table public.orders add column if not exists country text not null default 'RO';
alter table public.orders add column if not exists weight_kg numeric;
alter table public.orders add column if not exists parcels_count integer not null default 1;
alter table public.orders add column if not exists cod_amount numeric;

-- 2. Setari Courier Manager, cate un rand per organizatie
create table if not exists public.courier_manager_settings (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null unique references public.organizations(id) on delete cascade,
  base_url          text not null default 'https://app.slm.team/slm/API',
  api_key           text not null,
  is_active         boolean not null default true,
  last_test_at      timestamptz,
  last_test_ok      boolean,
  last_test_message text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.courier_manager_settings enable row level security;

drop policy if exists p_courier_manager_settings on public.courier_manager_settings;
create policy p_courier_manager_settings on public.courier_manager_settings for all
using (public.is_admin(organization_id))
with check (public.is_admin(organization_id));

-- 3. Extindere shipments (tabela deja existenta) pentru integrarea reala
alter table public.shipments add column if not exists raw_response jsonb;
alter table public.shipments add column if not exists error text;
alter table public.shipments add column if not exists created_by uuid references auth.users(id);
alter table public.shipments add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_shipments_order_id on public.shipments (order_id);

-- 4. advance_order: 'nou' aloca pick-ul ca inainte; 'de_pregatit' si
--    'ambalat' redirectioneaza catre fluxurile dedicate (nu se mai
--    intampla nimic automat la aceste pasi)
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
    raise exception 'Foloseste ecranul comenzii pentru a genera AWB-ul.';

  else
    raise exception 'Comanda nu mai poate avansa din statusul curent.';
  end if;
end;
$$;

grant execute on function public.advance_order(uuid) to authenticated;

-- 5. Scriere atomica a rezultatului unui AWB (succes sau eroare) +
--    trecerea comenzii pe "expediat" doar cand AWB-ul chiar exista.
create or replace function public.courier_record_shipment(
  p_order_id uuid,
  p_awb text,
  p_status text,
  p_raw_response jsonb,
  p_error text default null
)
returns public.shipments
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid;
  v_row public.shipments;
begin
  select organization_id into v_org from public.orders where id = p_order_id;
  if v_org is null then
    raise exception 'Comanda nu exista.';
  end if;

  insert into public.shipments
    (organization_id, order_id, awb, courier, status, raw_response, error, created_by, updated_at, shipped_at)
  values
    (v_org, p_order_id, p_awb, 'courier_manager', p_status, p_raw_response, p_error, auth.uid(), now(),
     case when p_awb is not null then now() else null end)
  on conflict (order_id) do update set
    awb          = excluded.awb,
    status       = excluded.status,
    raw_response = excluded.raw_response,
    error        = excluded.error,
    updated_at   = now(),
    shipped_at   = case when excluded.awb is not null then now() else public.shipments.shipped_at end
  returning * into v_row;

  if p_awb is not null then
    update public.orders set status = 'expediat' where id = p_order_id;
  end if;

  return v_row;
end;
$$;

grant execute on function public.courier_record_shipment(uuid, text, text, jsonb, text) to authenticated;

-- 6. status-ul CM (uncollected/active/delivered/anulat/etc, posibil in
--    limba contului) nu se potriveste cu enum-ul vechi (generat/expediat/
--    livrat/retur) folosit doar de fluxul fals anterior — trece pe text.
alter table public.shipments alter column status drop default;
alter table public.shipments alter column status type text using status::text;
alter table public.shipments alter column status set default 'uncollected';

-- 7. inlocuiesc courier_record_shipment cu o varianta doar-succes (mai simpla,
--    fara branch pentru awb null) — esecurile se scriu direct din ruta API,
--    fara sa rescrie un AWB anterior cu null
drop function if exists public.courier_record_shipment(uuid, text, text, jsonb, text);

create or replace function public.courier_record_shipment(
  p_order_id uuid,
  p_awb text,
  p_status text,
  p_raw_response jsonb
)
returns public.shipments
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid;
  v_row public.shipments;
begin
  select organization_id into v_org from public.orders where id = p_order_id;
  if v_org is null then
    raise exception 'Comanda nu exista.';
  end if;
  if p_awb is null then
    raise exception 'AWB obligatoriu.';
  end if;

  insert into public.shipments
    (organization_id, order_id, awb, courier, status, raw_response, error, created_by, updated_at, shipped_at)
  values
    (v_org, p_order_id, p_awb, 'courier_manager', p_status, p_raw_response, null, auth.uid(), now(), now())
  on conflict (order_id) do update set
    awb          = excluded.awb,
    status       = excluded.status,
    raw_response = excluded.raw_response,
    error        = null,
    updated_at   = now(),
    shipped_at   = now()
  returning * into v_row;

  update public.orders set status = 'expediat' where id = p_order_id;

  return v_row;
end;
$$;

grant execute on function public.courier_record_shipment(uuid, text, text, jsonb) to authenticated;
