-- ============================================================
-- DepoziteX — functie de avansare comanda (Comenzi)
-- Muta o comanda la urmatorul status din flux:
--   nou -> de_pregatit   (PICK: scade stocul din inventory)
--   de_pregatit -> ambalat
--   ambalat -> expediat  (genereaza AWB in shipments)
-- Totul atomic; RLS-ul existent (is_member) se aplica normal,
-- functia ruleaza cu drepturile userului care o apeleaza.
-- Rulare: Supabase -> SQL Editor -> New query -> paste -> Run
-- Idempotent: poti rula scriptul de mai multe ori fara erori.
-- ============================================================

create or replace function public.advance_order(p_order_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status order_status;
  v_org    uuid;
  v_line   record;
  v_loc    record;
  v_awb    text;
  v_courier text;
begin
  select status, organization_id into v_status, v_org from public.orders where id = p_order_id;

  if v_status is null then
    raise exception 'Comanda nu exista.';
  end if;

  if v_status = 'nou' then
    for v_line in select ol.id, ol.product_id, ol.quantity from public.order_lines ol where ol.order_id = p_order_id
    loop
      select id, location_id, quantity into v_loc
      from public.inventory
      where product_id = v_line.product_id and quantity >= v_line.quantity
      order by quantity desc
      limit 1;

      if v_loc.id is null then
        raise exception 'Stoc insuficient pentru unul dintre produsele comenzii.';
      end if;

      update public.inventory set quantity = quantity - v_line.quantity, updated_at = now() where id = v_loc.id;
      update public.order_lines set picked_quantity = v_line.quantity where id = v_line.id;

      insert into public.stock_movements
        (organization_id, product_id, location_id, quantity_change, movement_type, reference_type, reference_id, created_by)
      values
        (v_org, v_line.product_id, v_loc.location_id, -v_line.quantity, 'pick', 'order', p_order_id, auth.uid());
    end loop;

    update public.orders set status = 'de_pregatit' where id = p_order_id;

  elsif v_status = 'de_pregatit' then
    update public.orders set status = 'ambalat' where id = p_order_id;

  elsif v_status = 'ambalat' then
    v_awb := 'AWB' || floor(random() * 900000000 + 100000000)::text;
    v_courier := (array['Econt','Sameday','Cargus','FAN Courier'])[floor(random() * 4 + 1)];

    insert into public.shipments (organization_id, order_id, awb, courier, status, shipped_at)
    values (v_org, p_order_id, v_awb, v_courier, 'expediat', now());

    update public.orders set status = 'expediat' where id = p_order_id;

  else
    raise exception 'Comanda nu mai poate avansa din statusul curent.';
  end if;
end;
$$;

grant execute on function public.advance_order(uuid) to authenticated;
