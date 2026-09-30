-- ============================================================
-- DepoziteX — denumiri editabile pentru carucioare si cutii
-- 1) carts.box_labels: denumirile cutiilor, in ordinea pozitiilor
--    (null = implicit CUT01..CUTnn). Trebuie sa fie exact `capacity`
--    denumiri, unice pe carucior, doar litere mari/cifre/cratima
--    (ce se poate scana), diferite de codul caruciorului.
-- 2) codul si denumirile cutiilor NU se pot schimba cat timp caruciorul
--    e in picking sau la ambalare: etichetele lipite pe el sunt cele
--    dupa care lucreaza pickerul si ambalatorul.
-- Adminii editeaza direct tabela (politica p_carts_admin_update din 15).
-- Rulare: ./sql/apply.sh test sql/16_carucioare-denumiri.sql (apoi prod)
-- Idempotent: poti rula scriptul de mai multe ori fara erori.
-- ============================================================

alter table public.carts add column if not exists box_labels text[];

create or replace function public.valid_box_labels(p_labels text[], p_capacity integer, p_cart_code text)
returns boolean
language sql
immutable
as $$
  select p_labels is null or (
    array_ndims(p_labels) = 1
    and cardinality(p_labels) = p_capacity
    and not exists (select 1 from unnest(p_labels) l where l is null or l !~ '^[A-Z0-9-]{1,20}$' or l = p_cart_code)
    and (select count(distinct l) from unnest(p_labels) l) = p_capacity
  );
$$;

alter table public.carts drop constraint if exists carts_box_labels_valid;
alter table public.carts add constraint carts_box_labels_valid
  check (public.valid_box_labels(box_labels, capacity, code));

create or replace function public.carts_guard_rename()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.code is distinct from old.code or new.box_labels is distinct from old.box_labels)
     and exists (select 1 from public.cart_runs r where r.cart_id = old.id and r.status <> 'inchis') then
    raise exception 'Caruciorul % este folosit acum (picking sau ambalare). Denumirile se pot schimba dupa ce devine liber.', old.code;
  end if;
  return new;
end;
$$;

drop trigger if exists carts_guard_rename on public.carts;
create trigger carts_guard_rename
  before update on public.carts
  for each row execute function public.carts_guard_rename();
