-- ============================================================
-- DepoziteX WMS — Schema Supabase (PostgreSQL)
-- Multi-tenant: fiecare organizatie isi vede DOAR datele ei (RLS)
-- Rulare: Supabase → SQL Editor → paste → Run
-- Idempotent: poti rula scriptul de mai multe ori fara erori si
-- fara sa pierzi date existente (tabelele/indexii nu se recreeaza
-- daca exista deja; politicile si trigger-ul se inlocuiesc).
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. ENUM-uri (CREATE TYPE nu suporta IF NOT EXISTS -> DO block)
-- ------------------------------------------------------------
do $$ begin
  create type user_role as enum ('owner','admin','operator','viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum ('nou','de_pregatit','ambalat','expediat','anulat');
exception when duplicate_object then null; end $$;

do $$ begin
  create type receipt_status as enum ('draft','confirmat');
exception when duplicate_object then null; end $$;

do $$ begin
  create type shipment_status as enum ('generat','expediat','livrat','retur');
exception when duplicate_object then null; end $$;

do $$ begin
  create type movement_type as enum ('receptie','pick','ajustare','retur');
exception when duplicate_object then null; end $$;

do $$ begin
  create type disposition_type as enum ('restock','defect');
exception when duplicate_object then null; end $$;

do $$ begin
  create type plan_type as enum ('start','pro','business','enterprise');
exception when duplicate_object then null; end $$;

do $$ begin
  create type subscription_status as enum ('trial','activ','suspendat','anulat');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 2. Tenancy & acces
-- ------------------------------------------------------------
create table if not exists organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text unique not null,
  created_at timestamptz not null default now()
);

-- profil legat de contul de autentificare Supabase (auth.users)
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  created_at timestamptz not null default now()
);

-- leaga un utilizator de o organizatie, cu rol
create table if not exists memberships (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            user_role not null default 'operator',
  created_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);

-- ------------------------------------------------------------
-- 3. Catalog (clienti, depozite, locatii, produse, stoc)
-- ------------------------------------------------------------
-- "clients" = comerciantii ale caror produse le gestionezi in depozit
create table if not exists clients (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  contact         text,
  created_at      timestamptz not null default now()
);

create table if not exists warehouses (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  city            text,
  country         text default 'RO',
  created_at      timestamptz not null default now()
);

create table if not exists locations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  warehouse_id    uuid not null references warehouses(id) on delete cascade,
  code            text not null,               -- ex. A-01-02
  zone            text,
  created_at      timestamptz not null default now(),
  unique (warehouse_id, code)
);

create table if not exists products (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id       uuid not null references clients(id) on delete cascade,
  sku             text not null,
  name            text not null,
  reorder_point   integer not null default 0,
  created_at      timestamptz not null default now(),
  unique (organization_id, sku)
);

-- stocul real: cantitate per produs, per locatie (WMS corect)
create table if not exists inventory (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  product_id      uuid not null references products(id) on delete cascade,
  location_id     uuid not null references locations(id) on delete cascade,
  quantity        integer not null default 0,
  updated_at      timestamptz not null default now(),
  unique (product_id, location_id)
);

-- ------------------------------------------------------------
-- 4. Intrari (receptie)
-- ------------------------------------------------------------
create table if not exists receipts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id       uuid not null references clients(id),
  warehouse_id    uuid not null references warehouses(id),
  reference       text,
  status          receipt_status not null default 'draft',
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

create table if not exists receipt_lines (
  id          uuid primary key default gen_random_uuid(),
  receipt_id  uuid not null references receipts(id) on delete cascade,
  product_id  uuid not null references products(id),
  location_id uuid not null references locations(id),
  quantity    integer not null check (quantity > 0)
);

-- ------------------------------------------------------------
-- 5. Iesiri (comenzi & expedieri)
-- ------------------------------------------------------------
create table if not exists orders (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id       uuid not null references clients(id),
  order_no        text not null,
  channel         text,                        -- ex. Shopify, eMAG, manual
  status          order_status not null default 'nou',
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  unique (organization_id, order_no)
);

create table if not exists order_lines (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id) on delete cascade,
  product_id      uuid not null references products(id),
  quantity        integer not null check (quantity > 0),
  picked_quantity integer not null default 0
);

create table if not exists shipments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  order_id        uuid not null references orders(id) on delete cascade,
  awb             text,
  courier         text,
  status          shipment_status not null default 'generat',
  shipped_at      timestamptz,
  created_at      timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 6. Retururi
-- ------------------------------------------------------------
create table if not exists returns (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  shipment_id     uuid references shipments(id) on delete set null,
  product_id      uuid not null references products(id),
  quantity        integer not null check (quantity > 0),
  disposition     disposition_type not null default 'restock',
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 7. Jurnal miscari stoc (trasabilitate completa)
-- ------------------------------------------------------------
create table if not exists stock_movements (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  product_id      uuid not null references products(id),
  location_id     uuid references locations(id),
  quantity_change integer not null,            -- +intrari / -iesiri
  movement_type   movement_type not null,
  reference_type  text,                         -- 'receipt' | 'order' | 'return' | 'manual'
  reference_id    uuid,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 8. Abonament & facturare
-- ------------------------------------------------------------
create table if not exists subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null unique references organizations(id) on delete cascade,
  plan                   plan_type not null default 'start',
  status                 subscription_status not null default 'trial',
  monthly_order_limit    integer not null default 500,
  stripe_customer_id     text,
  stripe_subscription_id text,
  current_period_end     timestamptz,
  created_at             timestamptz not null default now()
);

-- contor comenzi/luna pentru facturarea depasirilor
create table if not exists usage_counters (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  period_month    date not null,                -- prima zi a lunii
  orders_count    integer not null default 0,
  unique (organization_id, period_month)
);

-- ------------------------------------------------------------
-- 9. Indexi utili
-- ------------------------------------------------------------
create index if not exists idx_memberships_user_id          on memberships     (user_id);
create index if not exists idx_clients_organization_id       on clients         (organization_id);
create index if not exists idx_products_organization_id      on products        (organization_id);
create index if not exists idx_inventory_organization_id     on inventory       (organization_id);
create index if not exists idx_orders_organization_id_status on orders          (organization_id, status);
create index if not exists idx_shipments_organization_id     on shipments       (organization_id);
create index if not exists idx_stock_movements_org_product   on stock_movements (organization_id, product_id);

-- ------------------------------------------------------------
-- 10. Row Level Security (izolarea intre clienti)
-- ------------------------------------------------------------
-- Functie ajutatoare: userul curent este membru al organizatiei?
create or replace function public.is_member(org uuid)
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
  );
$$;

-- Profilul: fiecare user isi vede doar randul propriu
alter table profiles enable row level security;
drop policy if exists profiles_self on profiles;
create policy profiles_self on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- Membership: userul isi vede propriile apartenente
alter table memberships enable row level security;
drop policy if exists memberships_self on memberships;
create policy memberships_self on memberships
  for select using (user_id = auth.uid());

-- Organizatii: membrii isi vad organizatia
alter table organizations enable row level security;
drop policy if exists organizations_member on organizations;
create policy organizations_member on organizations
  for select using (public.is_member(id));

-- Tabele cu organization_id: acces complet doar membrilor organizatiei
alter table clients         enable row level security;
alter table warehouses      enable row level security;
alter table locations       enable row level security;
alter table products        enable row level security;
alter table inventory       enable row level security;
alter table receipts        enable row level security;
alter table orders          enable row level security;
alter table shipments       enable row level security;
alter table returns         enable row level security;
alter table stock_movements enable row level security;
alter table subscriptions   enable row level security;
alter table usage_counters  enable row level security;

drop policy if exists p_clients         on clients;
drop policy if exists p_warehouses      on warehouses;
drop policy if exists p_locations       on locations;
drop policy if exists p_products        on products;
drop policy if exists p_inventory       on inventory;
drop policy if exists p_receipts        on receipts;
drop policy if exists p_orders          on orders;
drop policy if exists p_shipments       on shipments;
drop policy if exists p_returns         on returns;
drop policy if exists p_stock_movements on stock_movements;
drop policy if exists p_subscriptions   on subscriptions;
drop policy if exists p_usage_counters  on usage_counters;

create policy p_clients         on clients         for all using (public.is_member(organization_id)) with check (public.is_member(organization_id));
create policy p_warehouses      on warehouses      for all using (public.is_member(organization_id)) with check (public.is_member(organization_id));
create policy p_locations       on locations       for all using (public.is_member(organization_id)) with check (public.is_member(organization_id));
create policy p_products        on products        for all using (public.is_member(organization_id)) with check (public.is_member(organization_id));
create policy p_inventory       on inventory       for all using (public.is_member(organization_id)) with check (public.is_member(organization_id));
create policy p_receipts        on receipts        for all using (public.is_member(organization_id)) with check (public.is_member(organization_id));
create policy p_orders          on orders          for all using (public.is_member(organization_id)) with check (public.is_member(organization_id));
create policy p_shipments       on shipments       for all using (public.is_member(organization_id)) with check (public.is_member(organization_id));
create policy p_returns         on returns         for all using (public.is_member(organization_id)) with check (public.is_member(organization_id));
create policy p_stock_movements on stock_movements for all using (public.is_member(organization_id)) with check (public.is_member(organization_id));
create policy p_subscriptions   on subscriptions   for all using (public.is_member(organization_id)) with check (public.is_member(organization_id));
create policy p_usage_counters  on usage_counters  for all using (public.is_member(organization_id)) with check (public.is_member(organization_id));

-- Tabele copil (fara organization_id): verifica prin parinte
alter table receipt_lines enable row level security;
drop policy if exists p_receipt_lines on receipt_lines;
create policy p_receipt_lines on receipt_lines for all
  using (exists (select 1 from receipts r where r.id = receipt_id and public.is_member(r.organization_id)))
  with check (exists (select 1 from receipts r where r.id = receipt_id and public.is_member(r.organization_id)));

alter table order_lines enable row level security;
drop policy if exists p_order_lines on order_lines;
create policy p_order_lines on order_lines for all
  using (exists (select 1 from orders o where o.id = order_id and public.is_member(o.organization_id)))
  with check (exists (select 1 from orders o where o.id = order_id and public.is_member(o.organization_id)));

-- ------------------------------------------------------------
-- 11. Trigger: creeaza profil automat la inregistrarea unui user
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Gata. Urmatorii pasi (nu in acest script):
--  - conectarea aplicatiei la Supabase (client JS)
--  - flux de onboarding: creare organizatie + membership 'owner'
--  - functii SQL pentru pick/receptie care actualizeaza inventory
--    si scriu in stock_movements atomic
--  - integrare Stripe pe subscriptions
-- ============================================================
