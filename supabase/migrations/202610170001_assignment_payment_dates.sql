-- Payment tracking dates used by the application after each rider collection.
alter table public.rider_assignments
  add column if not exists last_payment_date date,
  add column if not exists next_due_date date;

create index if not exists rider_assignments_active_due_date_idx
  on public.rider_assignments (next_due_date)
  where is_active = true;