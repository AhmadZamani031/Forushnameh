-- Restrict direct execution of the updated_at trigger function.
-- PostgreSQL still invokes this function through its existing triggers.
revoke execute on function public.forushnameh_set_updated_at()
from public, anon, authenticated;

-- Support invoice lookups by customer within the owning user's records.
create index if not exists invoices_user_customer_idx
on public.invoices (user_id, customer_id)
where customer_id is not null;
