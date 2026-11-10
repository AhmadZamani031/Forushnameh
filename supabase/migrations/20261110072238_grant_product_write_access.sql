-- The current product form writes through the authenticated Supabase client.
-- RLS policies products_insert_own and products_update_own continue to enforce
-- that each user can only create or update rows owned by their own user_id.
grant insert, update on table public.products to authenticated;
