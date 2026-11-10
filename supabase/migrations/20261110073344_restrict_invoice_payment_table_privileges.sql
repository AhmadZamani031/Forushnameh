-- Payment records are append-only: clients may read and insert, never update or delete.
revoke all on table public.invoice_payments from public, anon, authenticated;
grant select, insert on table public.invoice_payments to authenticated;
