-- The new product-creation RPC only needs the authenticated user's
-- existing INSERT grant and products_insert_own RLS policy.
-- The nested stock-movement RPC retains its own narrowly scoped SECURITY DEFINER
-- implementation and auth.uid() ownership checks.
alter function public.forushnameh_create_product(jsonb, numeric)
security invoker;
