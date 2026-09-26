-- ============================================================
-- DepoziteX — actualizarea automata a statusului AWB (Courier Manager)
-- status_checked_at: cand a fost verificat ultima data statusul la curier
-- (de job-ul programat sau de butonul de refresh). Job-ul verifica intai
-- AWB-urile cele mai vechi (nulls first).
-- Idempotent: poate fi rulat de mai multe ori.
-- ============================================================

alter table public.shipments add column if not exists status_checked_at timestamptz;

create index if not exists idx_shipments_status_checked_at
  on public.shipments (status_checked_at nulls first)
  where awb is not null;
