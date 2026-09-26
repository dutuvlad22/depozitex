-- ============================================================
-- DepoziteX — control asupra crearii de organizatii noi
-- Site-ul e public (necesar pentru API-ul clientilor), deci oricine isi
-- poate face cont. Conturile trebuie sa ramana posibile: un coleg nou isi
-- face intai cont, apoi intra cu codul de invitatie (redeem_invite).
-- Ce se poate opri este crearea de ORGANIZATII noi de catre necunoscuti.
--
-- platform_settings.allow_new_organizations:
--   true  (implicit) — oricine isi poate crea o organizatie (ca pana acum)
--   false            — doar alaturare cu cod de invitatie
-- Productia ruleaza cu false (setat separat, vezi README).
-- Rulare: ./sql/apply.sh test sql/13_organizatii-noi.sql (apoi prod)
-- Idempotent: poti rula scriptul de mai multe ori fara erori.
-- ============================================================

create table if not exists public.platform_settings (
  key   text primary key,
  value jsonb not null
);
-- fara politici: tabela se citeste doar prin functiile de mai jos
alter table public.platform_settings enable row level security;

insert into public.platform_settings (key, value)
values ('allow_new_organizations', 'true')
on conflict (key) do nothing;

create or replace function public.new_organizations_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value #>> '{}')::boolean from public.platform_settings
                   where key = 'allow_new_organizations'), true);
$$;

grant execute on function public.new_organizations_allowed() to anon, authenticated;

create or replace function public.create_organization(org_name text, org_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Trebuie sa fii autentificat.';
  end if;
  if not public.new_organizations_allowed() then
    raise exception 'Crearea de organizatii noi este dezactivata. Cere un cod de invitatie administratorului tau.';
  end if;

  insert into public.organizations (name, slug)
  values (org_name, org_slug)
  returning id into new_org_id;

  insert into public.memberships (organization_id, user_id, role)
  values (new_org_id, auth.uid(), 'owner');

  insert into public.subscriptions (organization_id, plan, status, monthly_order_limit)
  values (new_org_id, 'start', 'trial', 500);

  return new_org_id;
end;
$$;

grant execute on function public.create_organization(text, text) to authenticated;
