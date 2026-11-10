-- Reject PostgreSQL special numeric values in invoice payloads.
-- PostgreSQL orders NaN above finite numeric values, so ordinary >= 0 checks
-- do not reject NaN. Keep all invoice calculations finite before writing rows.
create or replace function public.forushnameh_issue_invoice(p_invoice jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_settings public.business_settings%rowtype;
  v_customer public.customers%rowtype;
  v_invoice_id uuid;
  v_invoice_number text;
  v_invoice_date date;
  v_currency text;
  v_notes text;
  v_discount numeric(18,2);
  v_tax numeric(18,2);
  v_subtotal numeric(18,2) := 0;
  v_total numeric(18,2);
  v_item jsonb;
  v_product_id uuid;
  v_product public.products%rowtype;
  v_description text;
  v_unit text;
  v_quantity numeric(18,3);
  v_unit_price numeric(18,2);
  v_line_total numeric(18,2);
  v_sort_order integer := 0;
  v_customer_id uuid;
  v_customer_name text := '';
  v_customer_phone text := '';
  v_business_name text;
  v_business_phone text;
  v_business_address text;
begin
  v_user_id := (select auth.uid());
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_invoice is null or jsonb_typeof(p_invoice) <> 'object' then
    raise exception 'Invoice payload must be a JSON object';
  end if;
  if jsonb_typeof(p_invoice -> 'items') <> 'array'
     or jsonb_array_length(p_invoice -> 'items') = 0 then
    raise exception 'Invoice must contain at least one item';
  end if;

  select * into v_settings
    from public.business_settings
   where user_id = v_user_id
   for update;
  if not found then raise exception 'Business settings not found'; end if;

  v_business_name := v_settings.business_name;
  v_business_phone := v_settings.phone;
  v_business_address := v_settings.address;
  v_currency := coalesce(nullif(p_invoice ->> 'currency', ''), v_settings.default_currency, 'تومان');
  v_invoice_date := coalesce(nullif(p_invoice ->> 'invoice_date', '')::date, current_date);
  v_notes := coalesce(p_invoice ->> 'notes', '');
  v_discount := coalesce(nullif(p_invoice ->> 'discount_amount', '')::numeric, 0);
  v_tax := coalesce(nullif(p_invoice ->> 'tax_amount', '')::numeric, 0);

  if v_discount::text in ('NaN', 'Infinity', '-Infinity')
     or v_tax::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Discount and tax must be finite numbers';
  end if;
  if v_discount < 0 or v_tax < 0 then
    raise exception 'Discount and tax cannot be negative';
  end if;

  if nullif(p_invoice ->> 'customer_id', '') is not null then
    v_customer_id := (p_invoice ->> 'customer_id')::uuid;
    select * into v_customer
      from public.customers
     where id = v_customer_id and user_id = v_user_id and is_active = true;
    if not found then raise exception 'Customer not found or inactive'; end if;
    v_customer_name := v_customer.name;
    v_customer_phone := v_customer.phone;
  else
    v_customer_id := null;
    v_customer_name := coalesce(p_invoice ->> 'customer_name', '');
    v_customer_phone := coalesce(p_invoice ->> 'customer_phone', '');
  end if;

  for v_item in select value from jsonb_array_elements(p_invoice -> 'items')
  loop
    v_sort_order := v_sort_order + 1;
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Each invoice item must be an object';
    end if;
    if nullif(v_item ->> 'quantity', '') is null
       or nullif(v_item ->> 'unit_price', '') is null then
      raise exception 'Each item requires quantity and unit_price';
    end if;
    v_quantity := (v_item ->> 'quantity')::numeric;
    v_unit_price := (v_item ->> 'unit_price')::numeric;
    if v_quantity is null or v_unit_price is null
       or v_quantity::text in ('NaN', 'Infinity', '-Infinity')
       or v_unit_price::text in ('NaN', 'Infinity', '-Infinity')
       or v_quantity <= 0 or v_unit_price < 0 then
      raise exception 'Invalid item quantity or unit price';
    end if;

    v_line_total := round(v_quantity * v_unit_price, 2);
    v_subtotal := v_subtotal + v_line_total;

    if nullif(v_item ->> 'product_id', '') is not null then
      v_product_id := (v_item ->> 'product_id')::uuid;
      select * into v_product
        from public.products
       where id = v_product_id and user_id = v_user_id and is_active = true
       for update;
      if not found then raise exception 'Product not found or inactive'; end if;
      if v_product.stock_on_hand < v_quantity then
        raise exception 'Insufficient stock for product: %', v_product.name;
      end if;
      v_description := coalesce(nullif(v_item ->> 'description', ''), v_product.name);
      v_unit := coalesce(nullif(v_item ->> 'unit', ''), v_product.unit);
    else
      v_product_id := null;
      v_description := nullif(v_item ->> 'description', '');
      v_unit := coalesce(nullif(v_item ->> 'unit', ''), 'عدد');
      if v_description is null then
        raise exception 'A description is required for non-product invoice items';
      end if;
    end if;
  end loop;

  v_subtotal := round(v_subtotal, 2);
  if v_discount > v_subtotal then raise exception 'Discount cannot exceed subtotal'; end if;
  v_total := round(v_subtotal - v_discount + v_tax, 2);
  if v_total::text in ('NaN', 'Infinity', '-Infinity') or v_total < 0 then
    raise exception 'Invoice total must be a finite non-negative number';
  end if;

  v_invoice_number := v_settings.invoice_prefix || v_settings.next_invoice_number::text;
  update public.business_settings
     set next_invoice_number = next_invoice_number + 1
   where user_id = v_user_id;

  insert into public.invoices (
    user_id, customer_id, invoice_number, invoice_date, status, currency,
    business_name_snapshot, business_phone_snapshot, business_address_snapshot,
    customer_name_snapshot, customer_phone_snapshot, notes,
    subtotal, discount_amount, tax_amount, total_amount
  ) values (
    v_user_id, v_customer_id, v_invoice_number, v_invoice_date, 'issued', v_currency,
    v_business_name, v_business_phone, v_business_address,
    v_customer_name, v_customer_phone, v_notes,
    v_subtotal, v_discount, v_tax, v_total
  ) returning id into v_invoice_id;

  v_sort_order := 0;
  for v_item in select value from jsonb_array_elements(p_invoice -> 'items')
  loop
    v_sort_order := v_sort_order + 1;
    v_quantity := (v_item ->> 'quantity')::numeric;
    v_unit_price := (v_item ->> 'unit_price')::numeric;
    v_line_total := round(v_quantity * v_unit_price, 2);

    if nullif(v_item ->> 'product_id', '') is not null then
      v_product_id := (v_item ->> 'product_id')::uuid;
      select * into v_product
        from public.products
       where id = v_product_id and user_id = v_user_id and is_active = true;
      v_description := coalesce(nullif(v_item ->> 'description', ''), v_product.name);
      v_unit := coalesce(nullif(v_item ->> 'unit', ''), v_product.unit);
    else
      v_product_id := null;
      v_description := nullif(v_item ->> 'description', '');
      v_unit := coalesce(nullif(v_item ->> 'unit', ''), 'عدد');
    end if;

    insert into public.invoice_items (
      user_id, invoice_id, product_id, description,
      quantity, unit, unit_price, sort_order
    ) values (
      v_user_id, v_invoice_id, v_product_id, v_description,
      v_quantity, v_unit, v_sort_order
    );

    if v_product_id is not null then
      insert into public.inventory_movements (
        user_id, product_id, invoice_id, movement_type,
        quantity_delta, description, reference
      ) values (
        v_user_id, v_product_id, v_invoice_id, 'sale',
        -v_quantity, 'خروج بابت صدور فاکتور', v_invoice_number
      );
    end if;
  end loop;

  return jsonb_build_object(
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'status', 'issued',
    'subtotal', v_subtotal,
    'discount_amount', v_discount,
    'tax_amount', v_tax,
    'total_amount', v_total,
    'currency', v_currency
  );
end;
$function$;
