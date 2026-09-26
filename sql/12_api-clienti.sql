-- ============================================================
-- DepoziteX — API pentru clienti (intrarea comenzilor)
-- 1) numerele de comanda sunt unice per CLIENT (nu per organizatie):
--    doi clienti pot avea fiecare comanda "1001"
-- 2) orders.source: de unde a venit comanda ('manual' | 'api')
-- 3) client_api_keys: chei API per client; se stocheaza doar hash-ul,
--    cheia completa se vede o singura data, la generare
-- 4) create_client_api_key / revoke_client_api_key: pentru admini (UI)
-- 5) api_create_order / api_get_order / api_get_stock: apelate de
--    rutele /api/v1/* cu cheia clientului. Sunt SECURITY DEFINER si isi
--    fac singure autorizarea: cheia valida => acces DOAR la clientul ei.
--    Intorc jsonb {ok, ...} / {ok:false, code, error} in loc de exceptii,
--    ca ruta sa poata raspunde cu codul HTTP potrivit.
-- Rulare: ./sql/apply.sh test sql/12_api-clienti.sql (apoi prod)
-- Idempotent: poti rula scriptul de mai multe ori fara erori.
-- ============================================================

-- 1. unicitate numar comanda per client
alter table public.orders drop constraint if exists orders_organization_id_order_no_key;
create unique index if not exists orders_client_order_no_key on public.orders (client_id, order_no);

-- 2. sursa comenzii
alter table public.orders add column if not exists source text not null default 'manual';

-- 3. chei API
create table if not exists public.client_api_keys (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id       uuid not null references public.clients(id) on delete cascade,
  name            text not null,
  key_prefix      text not null,             -- primele caractere, pentru recunoastere in UI
  key_hash        text not null unique,      -- sha256 hex al cheii complete
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  last_used_at    timestamptz,
  revoked_at      timestamptz
);
create index if not exists idx_client_api_keys_org on public.client_api_keys (organization_id);

alter table public.client_api_keys enable row level security;
drop policy if exists p_client_api_keys_admin_select on public.client_api_keys;
create policy p_client_api_keys_admin_select on public.client_api_keys
  for select using (public.is_admin(organization_id));
-- insert/update doar prin functiile de mai jos (fara politici de scriere directa)

-- 4. generare / revocare (admin)
create or replace function public.create_client_api_key(p_client_id uuid, p_name text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org uuid;
  v_key text;
begin
  select organization_id into v_org from public.clients where id = p_client_id;
  if v_org is null then
    raise exception 'Clientul nu exista.';
  end if;
  if not public.is_admin(v_org) then
    raise exception 'Doar administratorii pot genera chei API.';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Numele cheii este obligatoriu.';
  end if;

  v_key := 'dx_' || encode(gen_random_bytes(24), 'hex');

  insert into public.client_api_keys (organization_id, client_id, name, key_prefix, key_hash, created_by)
  values (v_org, p_client_id, trim(p_name), left(v_key, 11), encode(digest(v_key, 'sha256'), 'hex'), auth.uid());

  return v_key;  -- singura data cand cheia completa exista in clar
end;
$$;

grant execute on function public.create_client_api_key(uuid, text) to authenticated;

create or replace function public.revoke_client_api_key(p_key_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.client_api_keys where id = p_key_id;
  if v_org is null or not public.is_admin(v_org) then
    raise exception 'Cheia nu exista sau nu ai drept sa o revoci.';
  end if;
  update public.client_api_keys set revoked_at = coalesce(revoked_at, now()) where id = p_key_id;
end;
$$;

grant execute on function public.revoke_client_api_key(uuid) to authenticated;

-- 5a. rezolvarea cheii (intern, nu se expune)
create or replace function public.api_key_client(p_api_key text, out client_id uuid, out organization_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.client_api_keys k
  set last_used_at = now()
  where k.key_hash = encode(digest(coalesce(p_api_key, ''), 'sha256'), 'hex')
    and k.revoked_at is null
  returning k.client_id, k.organization_id into client_id, organization_id;
end;
$$;

revoke all on function public.api_key_client(text) from public, anon, authenticated;

-- 5b. creare comanda
create or replace function public.api_create_order(p_api_key text, p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client   uuid;
  v_org      uuid;
  v_no       text;
  v_dest     jsonb;
  v_items    jsonb;
  v_item     jsonb;
  v_sku      text;
  v_qty      numeric;
  v_order_id uuid;
  v_existing record;
  v_missing  text[];
  v_lines    jsonb := '{}'::jsonb;   -- product_id -> cantitate (SKU-urile repetate se aduna)
  v_product  uuid;
  v_num      numeric;
begin
  select k.client_id, k.organization_id into v_client, v_org from public.api_key_client(p_api_key) k;
  if v_client is null then
    return jsonb_build_object('ok', false, 'code', 'unauthorized', 'error', 'Cheie API invalida sau revocata.');
  end if;

  if jsonb_typeof(p_order) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'Corpul cererii trebuie sa fie un obiect JSON.');
  end if;

  v_no := trim(p_order->>'numar_comanda');
  if coalesce(v_no, '') = '' or length(v_no) > 100 then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'numar_comanda este obligatoriu (maxim 100 de caractere).');
  end if;

  -- idempotent: aceeasi comanda trimisa din nou => raspunsul pentru cea existenta
  select id, status, created_at into v_existing from public.orders where client_id = v_client and order_no = v_no;
  if found then
    return jsonb_build_object('ok', true, 'created', false, 'id', v_existing.id, 'numar_comanda', v_no,
                              'status', v_existing.status, 'creata_la', v_existing.created_at);
  end if;

  v_dest := p_order->'destinatar';
  if jsonb_typeof(v_dest) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'destinatar este obligatoriu.');
  end if;
  select array_agg(f) into v_missing
  from unnest(array['nume', 'telefon', 'strada', 'oras', 'judet']) f
  where coalesce(trim(v_dest->>f), '') = '';
  if v_missing is not null then
    return jsonb_build_object('ok', false, 'code', 'invalid',
      'error', 'Lipsesc campuri din destinatar: ' || array_to_string(v_missing, ', ') || '.');
  end if;

  v_items := p_order->'produse';
  if jsonb_typeof(v_items) is distinct from 'array' or jsonb_array_length(v_items) = 0
     or jsonb_array_length(v_items) > 200 then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'produse trebuie sa aiba intre 1 si 200 de linii.');
  end if;

  for v_item in select * from jsonb_array_elements(v_items)
  loop
    v_sku := trim(v_item->>'sku');
    v_qty := case when jsonb_typeof(v_item->'cantitate') = 'number' then (v_item->>'cantitate')::numeric end;
    if coalesce(v_sku, '') = '' or v_qty is null or v_qty <> trunc(v_qty) or v_qty < 1 or v_qty > 100000 then
      return jsonb_build_object('ok', false, 'code', 'invalid',
        'error', 'Fiecare produs are nevoie de sku si cantitate (numar intreg intre 1 si 100000).');
    end if;
    select id into v_product from public.products where client_id = v_client and sku = v_sku;
    if v_product is null then
      return jsonb_build_object('ok', false, 'code', 'unknown_sku', 'error', 'SKU necunoscut: ' || v_sku || '.');
    end if;
    v_lines := jsonb_set(v_lines, array[v_product::text],
                         to_jsonb(coalesce((v_lines->>v_product::text)::integer, 0) + v_qty::integer));
  end loop;

  -- campuri numerice optionale
  foreach v_sku in array array['ramburs', 'greutate_kg', 'colete'] loop
    if p_order ? v_sku and jsonb_typeof(p_order->v_sku) not in ('number', 'null') then
      return jsonb_build_object('ok', false, 'code', 'invalid', 'error', v_sku || ' trebuie sa fie un numar.');
    end if;
  end loop;
  if (p_order->>'ramburs')::numeric < 0 or (p_order->>'greutate_kg')::numeric < 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'ramburs si greutate_kg nu pot fi negative.');
  end if;
  v_num := (p_order->>'colete')::numeric;
  if v_num is not null and (v_num <> trunc(v_num) or v_num < 1 or v_num > 100) then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'colete trebuie sa fie un numar intreg intre 1 si 100.');
  end if;

  begin
    insert into public.orders
      (organization_id, client_id, order_no, channel, status, source,
       recipient_name, recipient_phone, address_street, address_number, city, county, postal_code, country,
       weight_kg, parcels_count, cod_amount)
    values
      (v_org, v_client, v_no, nullif(trim(p_order->>'canal'), ''), 'nou', 'api',
       trim(v_dest->>'nume'), trim(v_dest->>'telefon'), trim(v_dest->>'strada'), nullif(trim(v_dest->>'numar'), ''),
       trim(v_dest->>'oras'), trim(v_dest->>'judet'), nullif(trim(v_dest->>'cod_postal'), ''),
       coalesce(nullif(upper(trim(v_dest->>'tara')), ''), 'RO'),
       nullif((p_order->>'greutate_kg')::numeric, 0), coalesce((p_order->>'colete')::integer, 1),
       nullif((p_order->>'ramburs')::numeric, 0))
    returning id into v_order_id;
  exception when unique_violation then
    -- aceeasi comanda trimisa de doua ori in acelasi moment: a castigat cealalta cerere
    select id, status, created_at into v_existing from public.orders where client_id = v_client and order_no = v_no;
    return jsonb_build_object('ok', true, 'created', false, 'id', v_existing.id, 'numar_comanda', v_no,
                              'status', v_existing.status, 'creata_la', v_existing.created_at);
  end;

  insert into public.order_lines (order_id, product_id, quantity)
  select v_order_id, key::uuid, value::integer from jsonb_each_text(v_lines);

  return jsonb_build_object('ok', true, 'created', true, 'id', v_order_id, 'numar_comanda', v_no,
                            'status', 'nou', 'creata_la', now());
end;
$$;

grant execute on function public.api_create_order(text, jsonb) to anon, authenticated;

-- 5c. status comanda
create or replace function public.api_get_order(p_api_key text, p_order_no text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid;
  v_order  record;
begin
  select k.client_id into v_client from public.api_key_client(p_api_key) k;
  if v_client is null then
    return jsonb_build_object('ok', false, 'code', 'unauthorized', 'error', 'Cheie API invalida sau revocata.');
  end if;

  select o.id, o.order_no, o.status, o.created_at, s.awb, s.courier, s.status as awb_status, s.shipped_at
  into v_order
  from public.orders o
  left join public.shipments s on s.order_id = o.id
  where o.client_id = v_client and o.order_no = p_order_no;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Comanda nu exista.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'numar_comanda', v_order.order_no,
    'status', v_order.status,
    'creata_la', v_order.created_at,
    'awb', v_order.awb,
    'curier', v_order.courier,
    'status_awb', v_order.awb_status,
    'expediata_la', v_order.shipped_at,
    'produse', coalesce((
      select jsonb_agg(jsonb_build_object('sku', p.sku, 'cantitate', ol.quantity) order by p.sku)
      from public.order_lines ol join public.products p on p.id = ol.product_id
      where ol.order_id = v_order.id
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.api_get_order(text, text) to anon, authenticated;

-- 5d. stoc client
create or replace function public.api_get_stock(p_api_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid;
begin
  select k.client_id into v_client from public.api_key_client(p_api_key) k;
  if v_client is null then
    return jsonb_build_object('ok', false, 'code', 'unauthorized', 'error', 'Cheie API invalida sau revocata.');
  end if;

  return jsonb_build_object('ok', true, 'produse', coalesce((
    select jsonb_agg(jsonb_build_object('sku', p.sku, 'nume', p.name, 'stoc', coalesce(i.qty, 0)) order by p.sku)
    from public.products p
    left join (select product_id, sum(quantity) as qty from public.inventory group by product_id) i
      on i.product_id = p.id
    where p.client_id = v_client
  ), '[]'::jsonb));
end;
$$;

grant execute on function public.api_get_stock(text) to anon, authenticated;
