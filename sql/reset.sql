-- ============================================================
-- DepoziteX WMS — Reset schema
-- Sterge TOT ce creeaza depozitex-schema.sql, ca sa poti rula
-- scriptul din nou de la zero. ATENTIE: sterge si datele!
-- Ruleaza acest fisier, apoi depozitex-schema.sql.
-- ============================================================

-- trigger + functii
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.is_member(uuid) cascade;

-- tabele (cascade sterge si policy-urile RLS, indexii, FK-urile dependente)
drop table if exists usage_counters   cascade;
drop table if exists subscriptions    cascade;
drop table if exists stock_movements  cascade;
drop table if exists returns          cascade;
drop table if exists shipments        cascade;
drop table if exists order_lines      cascade;
drop table if exists orders           cascade;
drop table if exists receipt_lines    cascade;
drop table if exists receipts         cascade;
drop table if exists inventory        cascade;
drop table if exists products         cascade;
drop table if exists locations        cascade;
drop table if exists warehouses       cascade;
drop table if exists clients          cascade;
drop table if exists memberships      cascade;
drop table if exists profiles         cascade;
drop table if exists organizations    cascade;

-- enum-uri
drop type if exists user_role          cascade;
drop type if exists order_status       cascade;
drop type if exists receipt_status     cascade;
drop type if exists shipment_status    cascade;
drop type if exists movement_type      cascade;
drop type if exists disposition_type   cascade;
drop type if exists plan_type          cascade;
drop type if exists subscription_status cascade;
