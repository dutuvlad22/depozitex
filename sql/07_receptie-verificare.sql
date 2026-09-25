-- ============================================================
-- DepoziteX — verificare receptie prin scanare
-- O receptie noua nu mai intra direct in stoc: ramane 'draft' pana
-- angajatul scaneaza fizic bucatile (camera -> SKU). Abia la
-- finalizare (finalize_receipt) se actualizeaza inventarul, cu
-- cantitatile REAL scanate (nu cele declarate de client).
-- Discrepantele (scanat != declarat) sunt permise la finalizare —
-- raman vizibile pe receptie pentru oricine se uita ulterior.
-- Rulare: Supabase -> SQL Editor -> New query -> paste -> Run
-- Idempotent: poti rula scriptul de mai multe ori fara erori.
-- ============================================================

-- 1. Cantitatea real scanata, per linie de receptie
alter table public.receipt_lines add column if not exists received_quantity integer not null default 0;

-- 2. create_receipt: acum creeaza receptia ca 'draft' si NU mai
--    atinge stocul — stocul se actualizeaza doar la finalizare.
create or replace function public.create_receipt(
  p_organization_id uuid,
  p_client_id uuid,
  p_warehouse_id uuid,
  p_reference text,
  p_lines jsonb -- array de {product_id, location_id, quantity}
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_receipt_id  uuid;
  v_line        jsonb;
  v_product_id  uuid;
  v_location_id uuid;
  v_quantity    integer;
begin
  if jsonb_array_length(p_lines) = 0 then
    raise exception 'Receptia trebuie sa aiba cel putin o linie.';
  end if;

  insert into public.receipts (organization_id, client_id, warehouse_id, reference, status, created_by)
  values (p_organization_id, p_client_id, p_warehouse_id, nullif(p_reference, ''), 'draft', auth.uid())
  returning id into v_receipt_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_product_id  := (v_line->>'product_id')::uuid;
    v_location_id := (v_line->>'location_id')::uuid;
    v_quantity    := (v_line->>'quantity')::integer;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Cantitatea trebuie sa fie pozitiva.';
    end if;

    insert into public.receipt_lines (receipt_id, product_id, location_id, quantity, received_quantity)
    values (v_receipt_id, v_product_id, v_location_id, v_quantity, 0);
  end loop;

  return v_receipt_id;
end;
$$;

grant execute on function public.create_receipt(uuid, uuid, uuid, text, jsonb) to authenticated;

-- 3. Scanare: incrementeaza/decrementeaza cantitatea scanata a unei
--    linii (delta +1 la fiecare scanare reusita, -1 la anulare
--    manuala). Blocata dupa ce receptia a fost finalizata.
create or replace function public.scan_receipt_line(p_receipt_line_id uuid, p_delta integer default 1)
returns public.receipt_lines
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status public.receipt_status;
  v_row    public.receipt_lines;
begin
  select r.status into v_status
  from public.receipt_lines rl
  join public.receipts r on r.id = rl.receipt_id
  where rl.id = p_receipt_line_id;

  if v_status is null then
    raise exception 'Linia de receptie nu exista.';
  end if;
  if v_status <> 'draft' then
    raise exception 'Receptia a fost deja finalizata.';
  end if;

  update public.receipt_lines
  set received_quantity = greatest(0, received_quantity + p_delta)
  where id = p_receipt_line_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.scan_receipt_line(uuid, integer) to authenticated;

-- 4. Finalizare: muta in inventory + stock_movements cantitatile
--    REAL scanate (nu cele declarate) si marcheaza receptia 'confirmat'.
--    Poate fi apelata de orice membru (nu doar admin) — face parte
--    din fluxul normal de lucru al depozitului.
create or replace function public.finalize_receipt(p_receipt_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org    uuid;
  v_status public.receipt_status;
  v_line   record;
begin
  select organization_id, status into v_org, v_status
  from public.receipts where id = p_receipt_id;

  if v_org is null then
    raise exception 'Receptia nu exista.';
  end if;
  if v_status <> 'draft' then
    raise exception 'Receptia a fost deja finalizata.';
  end if;

  for v_line in
    select product_id, location_id, received_quantity
    from public.receipt_lines
    where receipt_id = p_receipt_id and received_quantity > 0
  loop
    insert into public.inventory (organization_id, product_id, location_id, quantity)
    values (v_org, v_line.product_id, v_line.location_id, v_line.received_quantity)
    on conflict (product_id, location_id)
    do update set quantity = inventory.quantity + excluded.quantity, updated_at = now();

    insert into public.stock_movements
      (organization_id, product_id, location_id, quantity_change, movement_type, reference_type, reference_id, created_by)
    values
      (v_org, v_line.product_id, v_line.location_id, v_line.received_quantity, 'receptie', 'receipt', p_receipt_id, auth.uid());
  end loop;

  update public.receipts set status = 'confirmat' where id = p_receipt_id;
end;
$$;

grant execute on function public.finalize_receipt(uuid) to authenticated;
