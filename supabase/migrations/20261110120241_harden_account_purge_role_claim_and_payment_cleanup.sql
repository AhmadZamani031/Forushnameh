create or replace function public.forushnameh_purge_user_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_payments integer := 0;
  v_movements integer := 0;
  v_items integer := 0;
  v_invoices integer := 0;
  v_products integer := 0;
  v_customers integer := 0;
  v_settings integer := 0;
  v_profiles integer := 0;
  v_legacy integer := 0;
begin
  v_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''),
    nullif(current_setting('role', true), '')
  );
  if v_role is distinct from 'service_role' then raise exception 'Service role required'; end if;
  if p_user_id is null then raise exception 'User id is required'; end if;
  delete from public.invoice_payments where user_id = p_user_id and reversal_of is not null;
  delete from public.invoice_payments where user_id = p_user_id;
  get diagnostics v_payments = row_count;
  delete from public.inventory_movements where user_id = p_user_id;
  get diagnostics v_movements = row_count;
  delete from public.invoice_items where user_id = p_user_id;
  get diagnostics v_items = row_count;
  delete from public.invoices where user_id = p_user_id;
  get diagnostics v_invoices = row_count;
  delete from public.products where user_id = p_user_id;
  get diagnostics v_products = row_count;
  delete from public.customers where user_id = p_user_id;
  get diagnostics v_customers = row_count;
  delete from public.business_settings where user_id = p_user_id;
  get diagnostics v_settings = row_count;
  delete from public.profiles where id = p_user_id;
  get diagnostics v_profiles = row_count;
  delete from public.forushnameh_inventory_movements where user_id = p_user_id;
  get diagnostics v_legacy = row_count;
  delete from public.forushnameh_invoices where user_id = p_user_id;
  delete from public.forushnameh_products where user_id = p_user_id;
  delete from public.forushnameh_customers where user_id = p_user_id;
  return jsonb_build_object('invoice_payments',v_payments,'inventory_movements',v_movements,'invoice_items',v_items,'invoices',v_invoices,'products',v_products,'customers',v_customers,'business_settings',v_settings,'profiles',v_profiles,'legacy_inventory_movements',v_legacy);
end;
$function$;
revoke all on function public.forushnameh_purge_user_data(uuid) from public, anon, authenticated;
grant execute on function public.forushnameh_purge_user_data(uuid) to service_role;
