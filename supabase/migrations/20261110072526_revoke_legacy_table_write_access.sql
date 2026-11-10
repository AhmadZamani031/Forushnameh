-- Revoke write access to superseded legacy tables.
-- The current application uses the unprefixed tables. Legacy tables were
-- verified empty before this permission-only hardening; tables and data remain.
revoke insert, update, delete
on table
  public.forushnameh_products,
  public.forushnameh_customers,
  public.forushnameh_invoices,
  public.forushnameh_inventory_movements
from authenticated;
