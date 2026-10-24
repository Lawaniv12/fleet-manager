-- Adds owner-scoped access and private handover evidence for the existing app schema.
-- Existing rows remain inaccessible until owner_id is backfilled for the correct user.

alter table public.tricycles
  add column if not exists owner_id uuid references auth.users(id) default auth.uid();
alter table public.riders
  add column if not exists owner_id uuid references auth.users(id) default auth.uid();
alter table public.rider_assignments
  add column if not exists owner_id uuid references auth.users(id) default auth.uid();
alter table public.income
  add column if not exists owner_id uuid references auth.users(id) default auth.uid();
alter table public.expenses
  add column if not exists owner_id uuid references auth.users(id) default auth.uid();

update public.rider_assignments
set next_due_date = coalesce(last_payment_date, start_date)
  + greatest(1, coalesce(payment_cycle_days, 2))
where is_active = true and next_due_date is null;
alter table public.income
  add column if not exists rider_assignment_id uuid references public.rider_assignments(id) on delete set null;

create index if not exists tricycles_owner_id_idx on public.tricycles(owner_id);
create index if not exists riders_owner_id_idx on public.riders(owner_id);
create index if not exists rider_assignments_owner_id_idx on public.rider_assignments(owner_id);
create unique index if not exists rider_assignments_one_active_per_rider_idx
  on public.rider_assignments(owner_id, rider_id) where is_active = true;
create unique index if not exists rider_assignments_one_active_per_tricycle_idx
  on public.rider_assignments(owner_id, tricycle_id) where is_active = true;
create index if not exists income_owner_id_idx on public.income(owner_id);
create index if not exists expenses_owner_id_idx on public.expenses(owner_id);

alter table public.tricycles enable row level security;
alter table public.riders enable row level security;
alter table public.rider_assignments enable row level security;
alter table public.income enable row level security;
alter table public.expenses enable row level security;

create policy fleet_manager_owner_access on public.tricycles
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy fleet_manager_owner_access on public.riders
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy fleet_manager_owner_access on public.rider_assignments
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy fleet_manager_owner_access on public.income
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy fleet_manager_owner_access on public.expenses
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Restrictive guards also narrow any older permissive policies left on these tables.
create policy fleet_manager_owner_guard on public.tricycles
  as restrictive for all to public
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy fleet_manager_owner_guard on public.riders
  as restrictive for all to public
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy fleet_manager_owner_guard on public.rider_assignments
  as restrictive for all to public
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy fleet_manager_owner_guard on public.income
  as restrictive for all to public
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy fleet_manager_owner_guard on public.expenses
  as restrictive for all to public
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create table if not exists public.rider_agreement_versions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.rider_assignments(id) on delete restrict,
  owner_id uuid not null references auth.users(id),
  version_number integer not null,
  rider_id uuid not null references public.riders(id) on delete restrict,
  tricycle_id uuid not null references public.tricycles(id) on delete restrict,
  agreement_amount numeric not null,
  payment_cycle_days integer not null,
  start_date date not null,
  end_date date,
  is_active boolean not null,
  captured_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id),
  unique (assignment_id, version_number)
);

create index if not exists rider_agreement_versions_owner_idx
  on public.rider_agreement_versions(owner_id, captured_at desc);
alter table public.rider_agreement_versions enable row level security;
create policy fleet_manager_agreement_versions_read on public.rider_agreement_versions
  for select to authenticated using (owner_id = (select auth.uid()));
create policy fleet_manager_agreement_versions_owner_guard on public.rider_agreement_versions
  as restrictive for all to public using (owner_id = (select auth.uid()));

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);
alter table public.push_subscriptions enable row level security;
create policy fleet_manager_push_subscription_access on public.push_subscriptions
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy fleet_manager_push_subscription_owner_guard on public.push_subscriptions
  as restrictive for all to public
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create table if not exists public.reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  assignment_id uuid not null references public.rider_assignments(id) on delete restrict,
  due_date date not null,
  subscription_id uuid references public.push_subscriptions(id) on delete set null,
  status text not null check (status in ('pending', 'sent', 'failed')),
  attempted_at timestamptz not null default now(),
  delivered_at timestamptz,
  failure_reason text,
  unique (assignment_id, due_date, subscription_id)
);
create index if not exists reminder_deliveries_owner_attempt_idx
  on public.reminder_deliveries(owner_id, attempted_at desc);
alter table public.reminder_deliveries enable row level security;
create policy fleet_manager_reminder_delivery_read on public.reminder_deliveries
  for select to authenticated using (owner_id = (select auth.uid()));
create policy fleet_manager_reminder_delivery_owner_guard on public.reminder_deliveries
  as restrictive for all to public using (owner_id = (select auth.uid()));

create or replace function public.snapshot_rider_agreement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_version integer;
begin
  if tg_op = 'UPDATE'
    and row(new.rider_id, new.tricycle_id, new.agreement_amount, new.payment_cycle_days, new.start_date, new.end_date, new.is_active)
      is not distinct from
        row(old.rider_id, old.tricycle_id, old.agreement_amount, old.payment_cycle_days, old.start_date, old.end_date, old.is_active) then
    return new;
  end if;

  select coalesce(max(version_number), 0) + 1 into next_version
    from public.rider_agreement_versions where assignment_id = new.id;

  insert into public.rider_agreement_versions (
    assignment_id, owner_id, version_number, rider_id, tricycle_id,
    agreement_amount, payment_cycle_days, start_date, end_date, is_active, recorded_by
  ) values (
    new.id, new.owner_id, next_version, new.rider_id, new.tricycle_id,
    new.agreement_amount, new.payment_cycle_days, new.start_date, new.end_date, new.is_active, auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists rider_assignment_snapshot on public.rider_assignments;
create trigger rider_assignment_snapshot
  after insert or update of rider_id, tricycle_id, agreement_amount, payment_cycle_days, start_date, end_date, is_active
  on public.rider_assignments
  for each row execute function public.snapshot_rider_agreement();

insert into public.rider_agreement_versions (
  assignment_id, owner_id, version_number, rider_id, tricycle_id,
  agreement_amount, payment_cycle_days, start_date, end_date, is_active, recorded_by
)
select assignment.id, assignment.owner_id, 1, assignment.rider_id, assignment.tricycle_id,
  assignment.agreement_amount, assignment.payment_cycle_days, assignment.start_date,
  assignment.end_date, assignment.is_active, null
from public.rider_assignments assignment
where assignment.owner_id is not null
  and not exists (
    select 1 from public.rider_agreement_versions version
    where version.assignment_id = assignment.id
  );

create or replace function public.record_rider_payment(
  p_assignment_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_notes text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_assignment public.rider_assignments%rowtype;
  latest_payment_date date;
begin
  if p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  select * into current_assignment
    from public.rider_assignments
    where id = p_assignment_id
      and owner_id = (select auth.uid())
      and is_active
    for update;
  if not found then
    raise exception 'Active agreement not found';
  end if;

  insert into public.income (
    amount, payment_date, rider_id, tricycle_id, rider_assignment_id, notes, owner_id
  ) values (
    p_amount, p_payment_date, current_assignment.rider_id, current_assignment.tricycle_id,
    current_assignment.id, p_notes, current_assignment.owner_id
  );

  select max(payment_date) into latest_payment_date
    from public.income
    where rider_assignment_id = current_assignment.id;

  update public.rider_assignments
    set last_payment_date = latest_payment_date,
        next_due_date = latest_payment_date + greatest(1, coalesce(current_assignment.payment_cycle_days, 2))
    where id = current_assignment.id;
end;
$$;

create or replace function public.assign_rider(
  p_rider_id uuid,
  p_tricycle_id uuid,
  p_agreement_amount numeric,
  p_payment_cycle_days integer,
  p_start_date date
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_user_id uuid := (select auth.uid());
  new_assignment_id uuid;
begin
  if owner_user_id is null then raise exception 'Authentication required'; end if;
  if p_agreement_amount <= 0 or p_payment_cycle_days < 1 then
    raise exception 'Agreement amount and payment cycle must be positive';
  end if;
  if not exists (select 1 from public.riders where id = p_rider_id and owner_id = owner_user_id)
    or not exists (select 1 from public.tricycles where id = p_tricycle_id and owner_id = owner_user_id) then
    raise exception 'Rider and tricycle must belong to the signed-in owner';
  end if;

  update public.rider_assignments
    set is_active = false, end_date = p_start_date
    where owner_id = owner_user_id and is_active
      and (rider_id = p_rider_id or tricycle_id = p_tricycle_id);

  insert into public.rider_assignments (
    owner_id, rider_id, tricycle_id, agreement_amount, payment_cycle_days,
    start_date, next_due_date, is_active
  ) values (
    owner_user_id, p_rider_id, p_tricycle_id, p_agreement_amount,
    p_payment_cycle_days, p_start_date, p_start_date + p_payment_cycle_days, true
  ) returning id into new_assignment_id;

  return new_assignment_id;
end;
$$;

create table if not exists public.agreement_evidence (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  assignment_id uuid not null references public.rider_assignments(id) on delete restrict,
  evidence_type text not null check (evidence_type in ('vehicle_photo', 'signed_agreement')),
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  captured_at timestamptz,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid not null default auth.uid() references auth.users(id),
  notes text
);

create index if not exists agreement_evidence_assignment_idx
  on public.agreement_evidence(assignment_id, uploaded_at desc);
create index if not exists agreement_evidence_owner_idx
  on public.agreement_evidence(owner_id);

alter table public.agreement_evidence enable row level security;
create policy fleet_manager_owner_access on public.agreement_evidence
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and uploaded_by = (select auth.uid())
    and exists (
      select 1 from public.rider_assignments assignment
      where assignment.id = assignment_id
        and assignment.owner_id = (select auth.uid())
    )
  );
create policy fleet_manager_evidence_owner_guard on public.agreement_evidence
  as restrictive for all to public
  using (owner_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'agreement-evidence',
  'agreement-evidence',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy fleet_manager_evidence_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'agreement-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy fleet_manager_evidence_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'agreement-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy fleet_manager_evidence_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'agreement-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy fleet_manager_evidence_owner_guard on storage.objects
  as restrictive for all to public
  using (
    bucket_id <> 'agreement-evidence'
    or (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id <> 'agreement-evidence'
    or (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- The ledger is a view over income and expenses; make the underlying RLS apply.
alter view public.ledger_view set (security_invoker = true);