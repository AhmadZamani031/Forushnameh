-- Append-only invoice payment ledger with receipts and compensating reversals.
create table public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null,
  payment_type text not null default 'receipt'
    check (payment_type in ('receipt', 'reversal')),
  amount numeric(18,2) not null check (amount > 0),
  payment_method text not null
    check (payment_method in ('cash', 'card', 'bank_transfer', 'other')),
  paid_at timestamptz not null default now(),
  reference text not null default '',
  note text not null default '',
  reversal_of uuid,
  created_at timestamptz not null default now(),
  constraint invoice_payments_user_id_id_unique unique (user_id, id),
  constraint invoice_payments_invoice_same_user_fk
    foreign key (user_id, invoice_id)
    references public.invoices(user_id, id) on delete restrict,
  constraint invoice_payments_reversal_same_user_fk
    foreign key (user_id, reversal_of)
    references public.invoice_payments(user_id, id) on delete restrict,
  constraint invoice_payments_reversal_shape_check
    check (
      (payment_type = 'receipt' and reversal_of is null)
      or (payment_type = 'reversal' and reversal_of is not null)
    ),
  constraint invoice_payments_reference_length_check
    check (length(reference) <= 200),
  constraint invoice_payments_note_length_check
    check (length(note) <= 1000)
);

create index invoice_payments_user_invoice_paid_idx
  on public.invoice_payments (user_id, invoice_id, paid_at desc, id);
create unique index invoice_payments_one_reversal_idx
  on public.invoice_payments (user_id, reversal_of)
  where reversal_of is not null;

alter table public.invoice_payments enable row level security;
create policy invoice_payments_select_own
  on public.invoice_payments for select to authenticated
  using ((select auth.uid()) = user_id);
create policy invoice_payments_insert_own
  on public.invoice_payments for insert to authenticated
  with check ((select auth.uid()) = user_id);

create or replace function public.forushnameh_validate_invoice_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_invoice public.invoices%rowtype;
  v_original public.invoice_payments%rowtype;
  v_paid numeric(18,2);
begin
  v_user_id := (select auth.uid());
  if v_user_id is null or new.user_id <> v_user_id then
    raise exception 'Authentication or payment ownership check failed';
  end if;
  if new.amount is null or new.amount <= 0
     or new.amount::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Payment amount must be a positive finite number';
  end if;
  if length(coalesce(new.reference, '')) > 200
     or length(coalesce(new.note, '')) > 1000 then
    raise exception 'Payment reference or note is too long';
  end if;

  select * into v_invoice
    from public.invoices
   where id = new.invoice_id and user_id = v_user_id
   for update;
  if not found or v_invoice.status <> 'issued' then
    raise exception 'Issued invoice not found';
  end if;

  if new.payment_type = 'receipt' then
    if new.reversal_of is not null then
      raise exception 'A receipt cannot reference a reversed payment';
    end if;
    select coalesce(sum(
      case when payment_type = 'receipt' then amount else -amount end
    ), 0) into v_paid
    from public.invoice_payments
    where user_id = v_user_id and invoice_id = new.invoice_id;
    if new.amount > v_invoice.total_amount - v_paid then
      raise exception 'Payment exceeds the outstanding invoice balance';
    end if;
  elsif new.payment_type = 'reversal' then
    if new.reversal_of is null then
      raise exception 'A reversal must reference its original receipt';
    end if;
    select * into v_original
      from public.invoice_payments
     where id = new.reversal_of
       and user_id = v_user_id
       and invoice_id = new.invoice_id
       and payment_type = 'receipt'
     for update;
    if not found then
      raise exception 'Original receipt not found';
    end if;
    if new.amount <> v_original.amount
       or new.payment_method <> v_original.payment_method then
      raise exception 'A reversal must match the original receipt';
    end if;
  else
    raise exception 'Unsupported payment type';
  end if;
  return new;
end;
$function$;

revoke all on function public.forushnameh_validate_invoice_payment() from public, anon, authenticated;
create trigger invoice_payments_validate_before_insert
  before insert on public.invoice_payments
  for each row execute function public.forushnameh_validate_invoice_payment();

create or replace function public.forushnameh_prevent_invoice_payment_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'Invoice payment records are immutable; record a reversal instead';
end;
$function$;
revoke all on function public.forushnameh_prevent_invoice_payment_mutation() from public, anon, authenticated;
create trigger invoice_payments_immutable
  before update or delete on public.invoice_payments
  for each row execute function public.forushnameh_prevent_invoice_payment_mutation();
