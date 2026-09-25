-- ============================================================
-- DepoziteX — functie de receptie marfa
-- Creeaza o receptie + liniile ei, creste stocul (inventory) si
-- scrie in jurnalul de miscari (stock_movements), totul atomic.
-- RLS-ul existent (is_member) se aplica normal, ca functia ruleaza
-- cu drepturile userului care o apeleaza (security invoker).
-- Rulare: Supabase -> SQL Editor -> New query -> paste -> Run
-- Idempotent: poti rula scriptul de mai multe ori fara erori.
-- ============================================================

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
  values (p_organization_id, p_client_id, p_warehouse_id, nullif(p_reference, ''), 'confirmat', auth.uid())
  returning id into v_receipt_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_product_id  := (v_line->>'product_id')::uuid;
    v_location_id := (v_line->>'location_id')::uuid;
    v_quantity    := (v_line->>'quantity')::integer;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Cantitatea trebuie sa fie pozitiva.';
    end if;

    insert into public.receipt_lines (receipt_id, product_id, location_id, quantity)
    values (v_receipt_id, v_product_id, v_location_id, v_quantity);

    insert into public.inventory (organization_id, product_id, location_id, quantity)
    values (p_organization_id, v_product_id, v_location_id, v_quantity)
    on conflict (product_id, location_id)
    do update set quantity = inventory.quantity + excluded.quantity, updated_at = now();

    insert into public.stock_movements
      (organization_id, product_id, location_id, quantity_change, movement_type, reference_type, reference_id, created_by)
    values
      (p_organization_id, v_product_id, v_location_id, v_quantity, 'receptie', 'receipt', v_receipt_id, auth.uid());
  end loop;

  return v_receipt_id;
end;
$$;

grant execute on function public.create_receipt(uuid, uuid, uuid, text, jsonb) to authenticated;
