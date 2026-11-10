-- Create a product and its optional opening-stock ledger entry in one transaction.
-- Ownership is derived exclusively from auth.uid().
create or replace function public.forushnameh_create_product(
  p_product jsonb,
  p_initial_stock numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_name text;
  v_sku text;
  v_unit text;
  v_sale_price numeric(18,2);
  v_min_stock numeric(18,3);
  v_note text;
  v_product_id uuid;
  v_movement jsonb := null;
begin
  v_user_id := (select auth.uid());
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_product is null or jsonb_typeof(p_product) <> 'object' then
    raise exception 'Product payload must be a JSON object';
  end if;

  v_name := btrim(coalesce(p_product ->> 'name', ''));
  v_sku := nullif(btrim(coalesce(p_product ->> 'sku', '')), '');
  v_unit := nullif(btrim(coalesce(p_product ->> 'unit', '')), '');
  v_note := coalesce(p_product ->> 'note', '');

  if v_name = '' or length(v_name) > 200 then
    raise exception 'Product name is required and must be at most 200 characters';
  end if;
  if v_sku is not null and length(v_sku) > 100 then
    raise exception 'Product code is too long';
  end if;
  if v_unit is null or length(v_unit) > 40 then
    raise exception 'A valid product unit is required';
  end if;
  if length(v_note) > 2000 then
    raise exception 'Product note is too long';
  end if;
  if coalesce(p_product ->> 'sale_price', '0') in ('NaN', 'Infinity', '-Infinity')
     or coalesce(p_product ->> 'min_stock', '0') in ('NaN', 'Infinity', '-Infinity')
     or p_initial_stock::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Product prices and quantities must be finite numbers';
  end if;

  v_sale_price := coalesce(nullif(p_product ->> 'sale_price', '')::numeric, 0);
  v_min_stock := coalesce(nullif(p_product ->> 'min_stock', '')::numeric, 0);
  if v_sale_price < 0 or v_min_stock < 0 then
    raise exception 'Product price and minimum stock cannot be negative';
  end if;
  if p_initial_stock is null or p_initial_stock < 0
     or p_initial_stock > 999999999999999.999 then
    raise exception 'Initial stock is outside the allowed range';
  end if;

  insert into public.products (
    user_id, name, sku, unit, sale_price, min_stock, note, is_active
  ) values (
    v_user_id, v_name, v_sku, v_unit, v_sale_price, v_min_stock, v_note, true
  )
  returning id into v_product_id;

  if p_initial_stock > 0 then
    v_movement := public.forushnameh_record_stock_movement(
      v_product_id, 'opening', p_initial_stock,
      'موجودی اولیه', '', now()
    );
  end if;

  return jsonb_build_object(
    'product_id', v_product_id,
    'initial_movement', v_movement,
    'initial_stock', p_initial_stock
  );
end;
$function$;

revoke all on function public.forushnameh_create_product(jsonb, numeric) from public, anon;
grant execute on function public.forushnameh_create_product(jsonb, numeric) to authenticated;
