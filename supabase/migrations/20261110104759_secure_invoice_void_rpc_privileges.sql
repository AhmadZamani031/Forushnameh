alter function public.forushnameh_void_invoice(uuid, text) security definer;
revoke all on function public.forushnameh_void_invoice(uuid,text) from public,anon;
grant execute on function public.forushnameh_void_invoice(uuid,text) to authenticated;
