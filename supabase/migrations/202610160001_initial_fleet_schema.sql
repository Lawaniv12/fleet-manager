-- Base schema required by the Fleet Manager application migrations.

create table if not exists public.tricycles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  plate_number text not null,
  color text not null,
  purchase_cost numeric(12, 2) not null default 0 check (purchase_cost >= 0),
  registration_date date not null,
  status text not null default 'Active',
  created_at timestamptz not null default now()
);

create table if not exists public.riders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  name text not null,
  phone text not null,
  address text not null,
  national_id text,
  emergency_contact text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.rider_assignments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  rider_id uuid not null references public.riders(id) on delete restrict,
  tricycle_id uuid not null references public.tricycles(id) on delete restrict,
  start_date date not null,
  end_date date,
  agreement_amount numeric(12, 2) not null check (agreement_amount > 0),
  payment_cycle_days integer not null default 2 check (payment_cycle_days > 0),
  last_payment_date date,
  next_due_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.income (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  amount numeric(12, 2) not null check (amount > 0),
  payment_date date not null,
  rider_id uuid references public.riders(id) on delete set null,
  tricycle_id uuid not null references public.tricycles(id) on delete restrict,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  amount numeric(12, 2) not null check (amount > 0),
  expense_date date not null,
  category text not null,
  description text not null,
  tricycle_id uuid not null references public.tricycles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists rider_assignments_active_due_date_idx
  on public.rider_assignments(next_due_date) where is_active = true;
create unique index if not exists rider_assignments_one_active_per_rider_idx
  on public.rider_assignments(owner_id, rider_id) where is_active = true;
create unique index if not exists rider_assignments_one_active_per_tricycle_idx
  on public.rider_assignments(owner_id, tricycle_id) where is_active = true;

alter table public.tricycles enable row level security;
alter table public.riders enable row level security;
alter table public.rider_assignments enable row level security;
alter table public.income enable row level security;
alter table public.expenses enable row level security;

create policy base_owner_access on public.tricycles
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy base_owner_access on public.riders
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy base_owner_access on public.rider_assignments
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy base_owner_access on public.income
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy base_owner_access on public.expenses
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

grant select, insert, update, delete on public.tricycles to authenticated;
grant select, insert, update, delete on public.riders to authenticated;
grant select, insert, update, delete on public.rider_assignments to authenticated;
grant select, insert, update, delete on public.income to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;

create or replace view public.ledger_view
with (security_invoker = true)
as
  select
    income.id,
    income.payment_date::timestamptz as txn_date,
    income.amount,
    'income'::text as txn_type,
    'Rider payment'::text as category,
    income.notes as description,
    income.tricycle_id,
    income.rider_id,
    income.created_at
  from public.income income
  union all
  select
    expenses.id,
    expenses.expense_date::timestamptz as txn_date,
    expenses.amount,
    'expense'::text as txn_type,
    expenses.category,
    expenses.description,
    expenses.tricycle_id,
    null::uuid as rider_id,
    expenses.created_at
  from public.expenses expenses;

grant select on public.ledger_view to authenticated;