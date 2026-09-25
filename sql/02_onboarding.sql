-- ============================================================
-- DepoziteX — functie de onboarding
-- La prima logare, un utilizator isi creeaza organizatia,
-- devine automat 'owner' si i se porneste un abonament trial.
-- Rulare: Supabase -> SQL Editor -> New query -> paste -> Run
-- ============================================================

create or replace function public.create_organization(org_name text, org_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
begin
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
