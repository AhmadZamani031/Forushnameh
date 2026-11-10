-- Atomic restore of a version 6 Forushnameh backup into an empty workspace.
create or replace function public.forushnameh_restore_backup(p_backup jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_records jsonb;
  v_item jsonb;
  v_product jsonb;
  v_expected numeric;
  v_actual numeric;
  v_products integer := 0;
  v_customers integer := 0;
  v_invoices integer := 0;
  v_items integer := 0;
  v_movements integer := 0;
  v_payments integer := 0;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_backup is null or jsonb_typeof(p_backup) <> 'object'
     or p_backup ->> 'app' <> 'ForushNameh'
     or p_backup ->> 'formatVersion' <> '6' then
    raise exception 'Unsupported backup format; create a new version 6 backup';
  end if;
  v_records := p_backup -> 'records';
  if jsonb_typeof(v_records) <> 'object'
     or jsonb_typeof(v_records -> 'products') <> 'array'
     or jsonb_typeof(v_records -> 'customers') <> 'array'
     or jsonb_typeof(v_records -> 'invoices') <> 'array'
     or jsonb_typeof(v_records -> 'items') <> 'array'
     or jsonb_typeof(v_records -> 'movements') <> 'array'
     or jsonb_typeof(v_records -> 'payments') <> 'array'
     or jsonb_typeof(v_records -> 'businessSettings') <> 'object' then
    raise exception 'Backup is incomplete or has invalid record collections';
  end if;
  if jsonb_array_length(v_records -> 'products') > 5000
     or jsonb_array_length(v_records -> 'customers') > 10000
     or jsonb_array_length(v_records -> 'invoices') > 20000
     or jsonb_array_length(v_records -> 'items') > 100000
     or jsonb_array_length(v_records -> 'movements') > 100000
     or jsonb_array_length(v_records -> 'payments') > 100000 then
    raise exception 'Backup contains too many records for a single restore';
  end if;

  -- Never merge or replace an existing financial or stock ledger.
  if exists (select 1 from public.products where user_id = v_user_id)
     or exists (select 1 from public.customers where user_id = v_user_id)
     or exists (select 1 from public.invoices where user_id = v_user_id)
     or exists (select 1 from public.invoice_items where user_id = v_user_id)
     or exists (select 1 from public.inventory_movements where user_id = v_user_id)
     or exists (select 1 from public.invoice_payments where user_id = v_user_id) then
    raise exception 'Restore is allowed only when this account has no products, customers, invoices, stock movements or payments';
  end if;
  if not exists (select 1 from public.business_settings where user_id = v_user_id) then
    raise exception 'Business settings are missing for this account';
  end if;

  -- Validate the exported stock against its immutable movement ledger.
  for v_product in select value from jsonb_array_elements(v_records -> 'products')
  loop
    if nullif(v_product ->> 'id','') is null then raise exception 'A product is missing its ID'; end if;
    v_expected := coalesce(nullif(v_product ->> 'stock_on_hand','')::numeric,0);
    select coalesce(sum((m.value ->> 'quantity_delta')::numeric),0)
      into v_actual
      from jsonb_array_elements(v_records -> 'movements') m(value)
     where m.value ->> 'product_id' = v_product ->> 'id';
    if v_expected <> v_actual then
      raise exception 'Product stock does not match its movement history for product %',v_product ->> 'id';
    end if;
  end loop;

  insert into public.customers
    (id,user_id,name,phone,email,address,note,is_active,created_at,updated_at)
  select (x.value ->> 'id')::uuid,v_user_id,coalesce(x.value ->> 'name',''),
    coalesce(x.value ->> 'phone',''),coalesce(x.value ->> 'email',''),
    coalesce(x.value ->> 'address',''),coalesce(x.value ->> 'note',''),
    coalesce((x.value ->> 'is_active')::boolean,true),
    coalesce((x.value ->> 'created_at')::timestamptz,now()),
    coalesce((x.value ->> 'updated_at')::timestamptz,now())
  from jsonb_array_elements(v_records -> 'customers') x(value);
  get diagnostics v_customers = row_count;

  insert into public.products
    (id,user_id,name,sku,unit,sale_price,purchase_price,stock_on_hand,min_stock,note,is_active,created_at,updated_at)
  select (x.value ->> 'id')::uuid,v_user_id,coalesce(x.value ->> 'name',''),
    nullif(x.value ->> 'sku',''),coalesce(nullif(x.value ->> 'unit',''),'عدد'),
    coalesce(nullif(x.value ->> 'sale_price','')::numeric,0),
    coalesce(nullif(x.value ->> 'purchase_price','')::numeric,0),0,
    coalesce(nullif(x.value ->> 'min_stock','')::numeric,0),
    coalesce(x.value ->> 'note',''),coalesce((x.value ->> 'is_active')::boolean,true),
    coalesce((x.value ->> 'created_at')::timestamptz,now()),
    coalesce((x.value ->> 'updated_at')::timestamptz,now())
  from jsonb_array_elements(v_records -> 'products') x(value);
  get diagnostics v_products = row_count;

  insert into public.invoices
    (id,user_id,customer_id,invoice_number,invoice_date,status,currency,
     business_name_snapshot,business_phone_snapshot,business_address_snapshot,
     customer_name_snapshot,customer_phone_snapshot,notes,subtotal,discount_amount,
     tax_amount,total_amount,created_at,updated_at)
  select (x.value ->> 'id')::uuid,v_user_id,nullif(x.value ->> 'customer_id','')::uuid,
    x.value ->> 'invoice_number',(x.value ->> 'invoice_date')::date,
    coalesce(x.value ->> 'status','issued'),coalesce(x.value ->> 'currency','تومان'),
    coalesce(x.value ->> 'business_name_snapshot',''),coalesce(x.value ->> 'business_phone_snapshot',''),
    coalesce(x.value ->> 'business_address_snapshot',''),coalesce(x.value ->> 'customer_name_snapshot',''),
    coalesce(x.value ->> 'customer_phone_snapshot',''),coalesce(x.value ->> 'notes',''),
    coalesce((x.value ->> 'subtotal')::numeric,0),coalesce((x.value ->> 'discount_amount')::numeric,0),
    coalesce((x.value ->> 'tax_amount')::numeric,0),coalesce((x.value ->> 'total_amount')::numeric,0),
    coalesce((x.value ->> 'created_at')::timestamptz,now()),
    coalesce((x.value ->> 'updated_at')::timestamptz,now())
  from jsonb_array_elements(v_records -> 'invoices') x(value);
  get diagnostics v_invoices = row_count;

  insert into public.invoice_items
    (id,user_id,invoice_id,product_id,description,quantity,unit,unit_price,line_total,sort_order,created_at)
  select (x.value ->> 'id')::uuid,v_user_id,(x.value ->> 'invoice_id')::uuid,
    nullif(x.value ->> 'product_id','')::uuid,coalesce(x.value ->> 'description',''),
    (x.value ->> 'quantity')::numeric,coalesce(x.value ->> 'unit','عدد'),
    coalesce((x.value ->> 'unit_price')::numeric,0),
    coalesce(nullif(x.value ->> 'line_total','')::numeric,
      round((x.value ->> 'quantity')::numeric * coalesce((x.value ->> 'unit_price')::numeric,0),2)),
    coalesce((x.value ->> 'sort_order')::integer,0),
    coalesce((x.value ->> 'created_at')::timestamptz,now())
  from jsonb_array_elements(v_records -> 'items') x(value);
  get diagnostics v_items = row_count;

  -- The normal immutable stock trigger rebuilds balances from the ledger.
  insert into public.inventory_movements
    (id,user_id,product_id,invoice_id,movement_type,quantity_delta,description,reference,occurred_at,created_at)
  select (x.value ->> 'id')::uuid,v_user_id,(x.value ->> 'product_id')::uuid,
    nullif(x.value ->> 'invoice_id','')::uuid,x.value ->> 'movement_type',
    (x.value ->> 'quantity_delta')::numeric,coalesce(x.value ->> 'description',''),
    coalesce(x.value ->> 'reference',''),coalesce((x.value ->> 'occurred_at')::timestamptz,now()),
    coalesce((x.value ->> 'created_at')::timestamptz,now())
  from jsonb_array_elements(v_records -> 'movements') x(value)
  order by (x.value ->> 'created_at')::timestamptz nulls first,(x.value ->> 'id');
  get diagnostics v_movements = row_count;

  -- Restore receipts before reversals when their creation timestamps tie.
  for v_item in
    select value from jsonb_array_elements(v_records -> 'payments')
    order by coalesce((value ->> 'created_at')::timestamptz,(value ->> 'paid_at')::timestamptz,now()),
      case when value ->> 'payment_type' = 'reversal' then 1 else 0 end,
      value ->> 'id'
  loop
    insert into public.invoice_payments
      (id,user_id,invoice_id,payment_type,amount,payment_method,paid_at,reference,note,reversal_of,created_at)
    values
      ((v_item ->> 'id')::uuid,v_user_id,(v_item ->> 'invoice_id')::uuid,
       coalesce(v_item ->> 'payment_type','receipt'),(v_item ->> 'amount')::numeric,
       v_item ->> 'payment_method',coalesce((v_item ->> 'paid_at')::timestamptz,now()),
       coalesce(v_item ->> 'reference',''),coalesce(v_item ->> 'note',''),
       nullif(v_item ->> 'reversal_of','')::uuid,
       coalesce((v_item ->> 'created_at')::timestamptz,now()));
    v_payments := v_payments + 1;
  end loop;

  update public.business_settings
     set business_name = coalesce(v_records -> 'businessSettings' ->> 'business_name',business_name),
         phone = coalesce(v_records -> 'businessSettings' ->> 'phone',phone),
         address = coalesce(v_records -> 'businessSettings' ->> 'address',address),
         default_currency = coalesce(v_records -> 'businessSettings' ->> 'default_currency',default_currency),
         invoice_prefix = coalesce(v_records -> 'businessSettings' ->> 'invoice_prefix',invoice_prefix),
         next_invoice_number = greatest(next_invoice_number,
           coalesce(nullif(v_records -> 'businessSettings' ->> 'next_invoice_number','')::bigint,next_invoice_number))
   where user_id = v_user_id;

  -- Verify that replaying movements recreated every exported stock balance.
  for v_product in select value from jsonb_array_elements(v_records -> 'products')
  loop
    select stock_on_hand into v_actual from public.products
     where id = (v_product ->> 'id')::uuid and user_id = v_user_id;
    v_expected := coalesce(nullif(v_product ->> 'stock_on_hand','')::numeric,0);
    if v_actual <> v_expected then
      raise exception 'Restored stock validation failed for product %',v_product ->> 'id';
    end if;
  end loop;

  return jsonb_build_object('products',v_products,'customers',v_customers,
    'invoices',v_invoices,'items',v_items,'movements',v_movements,'payments',v_payments);
end;
$function$;
revoke all on function public.forushnameh_restore_backup(jsonb) from public, anon;
grant execute on function public.forushnameh_restore_backup(jsonb) to authenticated;
