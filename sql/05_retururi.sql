-- ============================================================
-- DepoziteX — functie de inregistrare retur
-- Creeaza returul si, daca decizia e "restock", reintroduce
-- cantitatea in stoc (inventory) + jurnal (stock_movements).
-- Totul atomic; RLS-ul existent (is_member) se aplica normal.
-- Rulare: Supabase -> SQL Editor -> New query -> paste -> Run
-- Idempotent: poti rula scriptul de mai multe ori fara erori.
-- ============================================================

create or replace function public.create_return(
  p_organization_id uuid,
  p_shipment_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_disposition disposition_type
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_return_id   uuid;
  v_location_id uuid;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Cantitatea trebuie sa fie pozitiva.';
  end if;

  insert into public.returns (organization_id, shipment_id, product_id, quantity, disposition, created_by)
  values (p_organization_id, p_shipment_id, p_product_id, p_quantity, p_disposition, auth.uid())
  returning id into v_return_id;

  if p_disposition = 'restock' then
    select location_id into v_location_id
    from public.inventory
    where product_id = p_product_id
    limit 1;

    if v_location_id is not null then
      update public.inventory
      set quantity = quantity + p_quantity, updated_at = now()
      where product_id = p_product_id and location_id = v_location_id;

      insert into public.stock_movements
        (organization_id, product_id, location_id, quantity_change, movement_type, reference_type, reference_id, created_by)
      values
        (p_organization_id, p_product_id, v_location_id, p_quantity, 'retur', 'return', v_return_id, auth.uid());
    end if;
  end if;

  return v_return_id;
end;
$$;

grant execute on function public.create_return(uuid, uuid, uuid, integer, disposition_type) to authenticated;
