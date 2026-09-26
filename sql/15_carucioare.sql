-- ============================================================
-- DepoziteX — picking pe carucior + statie de ambalare
-- Flux: pickerul scaneaza un carucior (CAR01) -> primeste pana la N
-- comenzi, cate una pe cutie (CUT01..CUTnn) -> ia produsele de la raft si
-- le pune in cutia indicata (verificata prin scanare) -> "Carucior gata":
-- comenzile trec in 'la_ambalare' -> la statia de ambalare se scaneaza
-- caruciorul si cutia, se verifica produsele, "Ambalat" -> AWB.
-- Cand toate cutiile sunt ambalate, caruciorul devine liber.
--
-- 1) status nou de comanda: la_ambalare (intre de_pregatit si ambalat)
-- 2) carts: caruciorul (cod + numar de cutii, maxim 20)
-- 3) cart_runs: o tura de picking pe un carucior; cart_run_boxes: comanda
--    din fiecare cutie
-- 4) order_lines.packed_quantity: verificarea de la ambalare
-- 5) functii: start_cart_run, finish_cart_run, release_cart_run (admin),
--    scan_pack_line, pack_order
-- 6) modul vechi "o comanda odata" (claim_next_order, release_order,
--    finalize_pick) se scoate: toate comenzile trec prin carucioare
-- Rulare: ./sql/apply.sh test sql/15_carucioare.sql (apoi prod)
-- Idempotent: poti rula scriptul de mai multe ori fara erori.
-- ============================================================

-- 1. status nou
alter type public.order_status add value if not exists 'la_ambalare' before 'ambalat';

-- 2. carucioare
create table if not exists public.carts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code            text not null check (code ~ '^[A-Z0-9-]{1,20}$'),
  capacity        integer not null check (capacity between 1 and 20),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (organization_id, code)
);

alter table public.carts enable row level security;
drop policy if exists p_carts_select on public.carts;
create policy p_carts_select on public.carts for select using (public.is_member(organization_id));
drop policy if exists p_carts_admin_insert on public.carts;
create policy p_carts_admin_insert on public.carts for insert with check (public.is_admin(organization_id));
drop policy if exists p_carts_admin_update on public.carts;
create policy p_carts_admin_update on public.carts for update
  using (public.is_admin(organization_id)) with check (public.is_admin(organization_id));

-- 3. ture de picking si cutii
create table if not exists public.cart_runs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cart_id         uuid not null references public.carts(id) on delete cascade,
  picker_id       uuid references public.profiles(id) on delete set null,
  status          text not null default 'picking' check (status in ('picking', 'la_ambalare', 'inchis')),
  started_at      timestamptz not null default now(),
  picked_at       timestamptz,
  closed_at       timestamptz
);
-- un carucior are o singura tura deschisa; un picker lucreaza pe un singur carucior
create unique index if not exists cart_runs_one_open_per_cart on public.cart_runs (cart_id) where status <> 'inchis';
create unique index if not exists cart_runs_one_per_picker on public.cart_runs (picker_id) where status = 'picking';

create table if not exists public.cart_run_boxes (
  id        uuid primary key default gen_random_uuid(),
  run_id    uuid not null references public.cart_runs(id) on delete cascade,
  box_no    integer not null check (box_no between 1 and 20),
  order_id  uuid not null references public.orders(id) on delete cascade,
  packed_at timestamptz,
  unique (run_id, box_no),
  unique (run_id, order_id)
);
create index if not exists idx_cart_run_boxes_order on public.cart_run_boxes (order_id);

alter table public.cart_runs enable row level security;
drop policy if exists p_cart_runs_select on public.cart_runs;
create policy p_cart_runs_select on public.cart_runs for select using (public.is_member(organization_id));

alter table public.cart_run_boxes enable row level security;
drop policy if exists p_cart_run_boxes_select on public.cart_run_boxes;
create policy p_cart_run_boxes_select on public.cart_run_boxes for select using (
  exists (select 1 from public.cart_runs r where r.id = run_id and public.is_member(r.organization_id))
);
-- scrierile pe ture/cutii se fac doar prin functiile de mai jos

-- 4. verificare la ambalare
alter table public.order_lines add column if not exists packed_quantity integer not null default 0;

-- 5a. pornire (sau reluare) tura pe carucior
create or replace function public.start_cart_run(p_organization_id uuid, p_cart_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_cart  public.carts;
  v_run   public.cart_runs;
  v_mine  public.cart_runs;
  v_cand  record;
  v_id    uuid;
  v_box   integer := 0;
begin
  if v_uid is null or not public.is_member(p_organization_id) then
    raise exception 'Acces interzis.';
  end if;

  select * into v_cart
  from public.carts
  where organization_id = p_organization_id and code = upper(trim(p_cart_code)) and active
  for update;
  if v_cart.id is null then
    raise exception 'Caruciorul % nu exista sau nu este activ.', upper(trim(p_cart_code));
  end if;

  select * into v_mine from public.cart_runs where picker_id = v_uid and status = 'picking';
  if v_mine.id is not null then
    if v_mine.cart_id = v_cart.id then
      return v_mine.id;   -- reluare
    end if;
    raise exception 'Ai deja un alt carucior in lucru. Termina-l intai.';
  end if;

  select * into v_run from public.cart_runs where cart_id = v_cart.id and status <> 'inchis';
  if v_run.id is not null then
    if v_run.status = 'picking' and v_run.picker_id is null then
      -- carucior eliberat de admin: il preia pickerul care l-a scanat
      update public.cart_runs set picker_id = v_uid where id = v_run.id;
      update public.orders set assigned_to = v_uid, assigned_at = now()
      where id in (select order_id from public.cart_run_boxes where run_id = v_run.id);
      return v_run.id;
    end if;
    raise exception 'Caruciorul % este deja folosit (%).', v_cart.code,
      case v_run.status when 'picking' then 'in picking' else 'asteapta la ambalare' end;
  end if;

  insert into public.cart_runs (organization_id, cart_id, picker_id)
  values (p_organization_id, v_cart.id, v_uid)
  returning * into v_run;

  -- intai comenzile deja alocate care nu sunt pe niciun carucior (ex. incepute
  -- in modul vechi "o comanda odata"): stocul lor e deja rezervat
  for v_cand in
    select o.id from public.orders o
    where o.organization_id = p_organization_id and o.status = 'de_pregatit'
      and not exists (select 1 from public.cart_run_boxes b join public.cart_runs r on r.id = b.run_id
                      where b.order_id = o.id and r.status <> 'inchis')
    order by o.created_at
  loop
    exit when v_box >= v_cart.capacity;
    select id into v_id from public.orders where id = v_cand.id for update skip locked;
    continue when v_id is null;
    v_box := v_box + 1;
    insert into public.cart_run_boxes (run_id, box_no, order_id) values (v_run.id, v_box, v_cand.id);
    update public.orders set assigned_to = v_uid, assigned_at = now() where id = v_cand.id;
  end loop;

  -- apoi cele mai vechi comenzi noi care au tot stocul, cate una pe cutie
  for v_cand in
    select id from public.orders
    where organization_id = p_organization_id and status = 'nou' and assigned_to is null
    order by created_at
    limit 500
  loop
    exit when v_box >= v_cart.capacity;

    select id into v_id from public.orders
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
      perform public.advance_order(v_cand.id);   -- aloca stocul (nou -> de_pregatit), picker = v_uid
      v_box := v_box + 1;
      insert into public.cart_run_boxes (run_id, box_no, order_id) values (v_run.id, v_box, v_cand.id);
    exception when raise_exception then
      null;   -- stocul a fost luat intre timp de alt picker: urmatoarea comanda
    end;
  end loop;

  if v_box = 0 then
    delete from public.cart_runs where id = v_run.id;
    return null;   -- nicio comanda de pregatit
  end if;

  return v_run.id;
end;
$$;

grant execute on function public.start_cart_run(uuid, text) to authenticated;

-- 5b. carucior gata -> comenzile merg la ambalare
create or replace function public.finish_cart_run(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.cart_runs;
begin
  select * into v_run from public.cart_runs where id = p_run_id for update;
  if v_run.id is null then
    raise exception 'Tura de picking nu exista.';
  end if;
  if not (v_run.picker_id = auth.uid() or public.is_admin(v_run.organization_id)) then
    raise exception 'Doar pickerul caruciorului (sau un admin) il poate finaliza.';
  end if;
  if v_run.status <> 'picking' then
    raise exception 'Caruciorul nu mai este in picking.';
  end if;

  -- cantitatile efectiv luate, pe linia de comanda (diferentele raman vizibile)
  update public.order_lines ol
  set picked_quantity = coalesce((select sum(opl.picked_quantity) from public.order_pick_lines opl
                                  where opl.order_line_id = ol.id), 0)
  where ol.order_id in (select order_id from public.cart_run_boxes where run_id = p_run_id);

  update public.orders set status = 'la_ambalare'
  where id in (select order_id from public.cart_run_boxes where run_id = p_run_id) and status = 'de_pregatit';

  update public.cart_runs set status = 'la_ambalare', picked_at = now() where id = p_run_id;
end;
$$;

grant execute on function public.finish_cart_run(uuid) to authenticated;

-- 5c. admin: elibereaza un carucior ramas in picking (pickerul a plecat);
--     urmatorul picker care scaneaza caruciorul continua de unde a ramas
create or replace function public.release_cart_run(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.cart_runs;
begin
  select * into v_run from public.cart_runs where id = p_run_id;
  if v_run.id is null or not public.is_admin(v_run.organization_id) then
    raise exception 'Tura nu exista sau nu ai drept sa o eliberezi.';
  end if;
  if v_run.status <> 'picking' then
    raise exception 'Doar caruciorele aflate in picking pot fi eliberate.';
  end if;
  update public.cart_runs set picker_id = null where id = p_run_id;
end;
$$;

grant execute on function public.release_cart_run(uuid) to authenticated;

-- 5d. ambalare: verificarea produselor din cutie (+1/-1)
create or replace function public.scan_pack_line(p_order_line_id uuid, p_delta integer default 1)
returns public.order_lines
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status order_status;
  v_row    public.order_lines;
begin
  select o.status into v_status
  from public.order_lines ol join public.orders o on o.id = ol.order_id
  where ol.id = p_order_line_id;

  if v_status is null then
    raise exception 'Linia de comanda nu exista.';
  end if;
  if v_status <> 'la_ambalare' then
    raise exception 'Comanda nu mai este la ambalare.';
  end if;

  update public.order_lines
  set packed_quantity = greatest(0, least(quantity, packed_quantity + p_delta))
  where id = p_order_line_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.scan_pack_line(uuid, integer) to authenticated;

-- 5e. ambalat: comanda -> 'ambalat' (urmeaza AWB), cutia se elibereaza;
--     ultima cutie ambalata inchide tura si elibereaza caruciorul
create or replace function public.pack_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org     uuid;
  v_status  order_status;
  v_run_id  uuid;
  v_left    integer;
begin
  select organization_id, status into v_org, v_status from public.orders where id = p_order_id for update;
  if v_org is null or not public.is_member(v_org) then
    raise exception 'Comanda nu exista.';
  end if;
  if v_status <> 'la_ambalare' then
    raise exception 'Comanda nu este la ambalare.';
  end if;

  update public.orders set status = 'ambalat' where id = p_order_id;

  update public.cart_run_boxes b set packed_at = now()
  from public.cart_runs r
  where b.order_id = p_order_id and r.id = b.run_id and r.status = 'la_ambalare'
  returning b.run_id into v_run_id;

  if v_run_id is not null then
    select count(*) into v_left from public.cart_run_boxes where run_id = v_run_id and packed_at is null;
    if v_left = 0 then
      update public.cart_runs set status = 'inchis', closed_at = now() where id = v_run_id;
    end if;
  end if;

  return jsonb_build_object('cart_free', v_run_id is not null and v_left = 0, 'boxes_left', coalesce(v_left, 0));
end;
$$;

grant execute on function public.pack_order(uuid) to authenticated;

-- 6. modul vechi "o comanda odata": inlocuit de carucioare
drop function if exists public.claim_next_order(uuid);
drop function if exists public.release_order(uuid);
drop function if exists public.finalize_pick(uuid);
