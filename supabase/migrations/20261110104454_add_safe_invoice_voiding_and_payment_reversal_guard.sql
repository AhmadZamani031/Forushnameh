alter table public.invoices
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text not null default '';
create unique index if not exists invoice_payments_one_reversal_idx
  on public.invoice_payments (user_id, reversal_of) where reversal_of is not null;
create or replace function public.forushnameh_void_invoice(p_invoice_id uuid,p_reason text default '')
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_user_id uuid; v_invoice public.invoices%rowtype; v_net_paid numeric(18,2); v_reason text; v_movement_count integer;
begin
 v_user_id := (select auth.uid());
 if v_user_id is null then raise exception 'Authentication required'; end if;
 if p_invoice_id is null then raise exception 'Invoice id is required'; end if;
 v_reason := btrim(coalesce(p_reason, ''));
 if length(v_reason)>500 then raise exception 'Void reason is too long'; end if;
 select * into v_invoice from public.invoices where id=p_invoice_id and user_id=v_user_id for update;
 if not found then raise exception 'Invoice not found'; end if;
 if v_invoice.status<>'issued' then raise exception 'Only issued invoices can be voided'; end if;
 select coalesce(sum(case when payment_type='receipt' then amount else -amount end),0)
 into v_net_paid from public.invoice_payments where user_id=v_user_id and invoice_id=p_invoice_id;
 if v_net_paid<>0 then raise exception 'Reverse all receipts before voiding this invoice'; end if;
 insert into public.inventory_movements(user_id,product_id,invoice_id,movement_type,quantity_delta,description,reference)
 select v_user_id,ii.product_id,p_invoice_id,'sale_return',sum(ii.quantity),
  'برگشت موجودی بابت ابطال فاکتور'||case when v_reason<>'' then ': '||v_reason else '' end,
  v_invoice.invoice_number
 from public.invoice_items ii where ii.user_id=v_user_id and ii.invoice_id=p_invoice_id and ii.product_id is not null
 group by ii.product_id order by ii.product_id;
 get diagnostics v_movement_count=row_count;
 update public.invoices set status='void',voided_at=now(),void_reason=v_reason
 where id=p_invoice_id and user_id=v_user_id and status='issued';
 if not found then raise exception 'Invoice status changed; reload and try again'; end if;
 return jsonb_build_object('invoice_id',p_invoice_id,'invoice_number',v_invoice.invoice_number,'status','void','stock_movements_created',v_movement_count,'voided_at',now());
end;
$function$;
revoke all on function public.forushnameh_void_invoice(uuid,text) from public,anon;
grant execute on function public.forushnameh_void_invoice(uuid,text) to authenticated;
