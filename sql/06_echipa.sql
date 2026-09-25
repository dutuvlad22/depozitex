-- ============================================================
-- DepoziteX — roluri, echipa si invitatii
-- - profiles capata email (afisare in Echipa)
-- - is_admin(org): userul e owner/admin in organizatie?
-- - DELETE pe clients/warehouses/locations/products/orders
--   e restrictionat la owner/admin (select/insert/update raman
--   neschimbate, disponibile oricarui membru)
-- - adminii pot schimba rolul / elimina membri din organizatia lor
-- - tabela invites + functie redeem_invite (alaturare cu cod)
-- - functie delete_order (admin), restituie stocul deja preluat
-- Rulare: Supabase -> SQL Editor -> New query -> paste -> Run
-- Idempotent: poti rula scriptul de mai multe ori fara erori.
-- ============================================================

-- 1. profiles + email (pentru afisarea membrilor echipei)
alter table public.profiles add column if not exists email text;

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is distinct from u.email;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- profilele membrilor din aceeasi organizatie devin vizibile intre ei
drop policy if exists profiles_org_members on public.profiles;
create policy profiles_org_members on public.profiles for select
using (
  exists (
    select 1 from public.memberships m1
    join public.memberships m2 on m1.organization_id = m2.organization_id
    where m1.user_id = auth.uid() and m2.user_id = profiles.id
  )
);

-- 2. helper: userul e owner/admin in organizatie?
create or replace function public.is_admin(org uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org
      and m.user_id = auth.uid()
      and m.role in ('owner','admin')
  );
$$;

-- 3. DELETE restrictionat la admin/owner (politici restrictive: se
--    combina cu AND peste politica permisiva existenta "for all")
drop policy if exists p_clients_delete_admin on public.clients;
create policy p_clients_delete_admin on public.clients as restrictive for delete
  using (public.is_admin(organization_id));

drop policy if exists p_warehouses_delete_admin on public.warehouses;
create policy p_warehouses_delete_admin on public.warehouses as restrictive for delete
  using (public.is_admin(organization_id));

drop policy if exists p_locations_delete_admin on public.locations;
create policy p_locations_delete_admin on public.locations as restrictive for delete
  using (public.is_admin(organization_id));

drop policy if exists p_products_delete_admin on public.products;
create policy p_products_delete_admin on public.products as restrictive for delete
  using (public.is_admin(organization_id));

drop policy if exists p_orders_delete_admin on public.orders;
create policy p_orders_delete_admin on public.orders as restrictive for delete
  using (public.is_admin(organization_id));

-- 4. Orice membru vede toata echipa organizatiei lui (doar select);
--    adminii, in plus, pot schimba rolul / elimina membri
drop policy if exists memberships_org_view on public.memberships;
create policy memberships_org_view on public.memberships for select
  using (public.is_member(organization_id));

drop policy if exists memberships_admin_manage on public.memberships;
create policy memberships_admin_manage on public.memberships for all
  using (public.is_admin(organization_id))
  with check (public.is_admin(organization_id));

-- 5. Invitatii (alaturare cu cod)
create table if not exists public.invites (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code            text not null unique,
  role            user_role not null default 'operator',
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '7 days'),
  used_by         uuid references auth.users(id),
  used_at         timestamptz
);
create index if not exists idx_invites_organization_id on public.invites (organization_id);

alter table public.invites enable row level security;

drop policy if exists p_invites_admin on public.invites;
create policy p_invites_admin on public.invites for all
  using (public.is_admin(organization_id))
  with check (public.is_admin(organization_id));

create or replace function public.redeem_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite record;
begin
  select * into v_invite from public.invites
  where code = p_code and used_by is null and expires_at > now();

  if v_invite.id is null then
    raise exception 'Cod de invitatie invalid sau expirat.';
  end if;

  if exists (
    select 1 from public.memberships
    where organization_id = v_invite.organization_id and user_id = auth.uid()
  ) then
    raise exception 'Esti deja membru al acestei organizatii.';
  end if;

  insert into public.memberships (organization_id, user_id, role)
  values (v_invite.organization_id, auth.uid(), v_invite.role);

  update public.invites set used_by = auth.uid(), used_at = now() where id = v_invite.id;

  return v_invite.organization_id;
end;
$$;

grant execute on function public.redeem_invite(text) to authenticated;

-- 6. Stergere comanda (doar admin), restituie stocul deja preluat (pick)
create or replace function public.delete_order(p_order_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org         uuid;
  v_line        record;
  v_location_id uuid;
begin
  select organization_id into v_org from public.orders where id = p_order_id;
  if v_org is null then
    raise exception 'Comanda nu exista.';
  end if;
  if not public.is_admin(v_org) then
    raise exception 'Doar administratorii pot sterge comenzi.';
  end if;

  for v_line in
    select ol.product_id, ol.picked_quantity
    from public.order_lines ol
    where ol.order_id = p_order_id and ol.picked_quantity > 0
  loop
    select location_id into v_location_id
    from public.inventory
    where product_id = v_line.product_id
    limit 1;

    if v_location_id is not null then
      update public.inventory
      set quantity = quantity + v_line.picked_quantity, updated_at = now()
      where product_id = v_line.product_id and location_id = v_location_id;
    end if;
  end loop;

  delete from public.orders where id = p_order_id;
end;
$$;

grant execute on function public.delete_order(uuid) to authenticated;
