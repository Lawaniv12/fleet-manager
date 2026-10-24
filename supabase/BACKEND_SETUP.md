# Supabase backend setup

For a fresh Supabase project, apply migrations in timestamp order: `202610160001_initial_fleet_schema.sql`, `202610170001_assignment_payment_dates.sql`, then `202610230001_agreement_evidence_and_owner_rls.sql`. The first migration creates the core app tables and `ledger_view`; the later migrations extend them. Test in staging and back up production first. The RLS setup assumes one owner per workspace; do not apply it unchanged if multiple operators need separate roles or shared business membership.

## Apply and backfill ownership

1. Confirm the project is empty or that its existing schema matches the base migration. Do not apply the base migration over a different/partial schema without reviewing it first.
2. Apply the migrations in timestamp order with the Supabase CLI (`supabase db push`) or run each file in order in the SQL editor.
3. Find the owner's Auth user UUID in Supabase Dashboard > Authentication > Users. Backfill existing rows before relying on the app. The owner migration deliberately does not guess who owns legacy records.

For a database where every existing row belongs to one owner, replace the UUID below and run in the SQL editor as an administrator:

```sql
update public.tricycles set owner_id = 'OWNER-USER-UUID' where owner_id is null;
update public.riders set owner_id = 'OWNER-USER-UUID' where owner_id is null;
update public.rider_assignments set owner_id = 'OWNER-USER-UUID' where owner_id is null;
update public.income set owner_id = 'OWNER-USER-UUID' where owner_id is null;
update public.expenses set owner_id = 'OWNER-USER-UUID' where owner_id is null;
```

If records belong to different users, map them individually using a trusted ownership source; do not assign all records to one person. After backfilling, seed agreement snapshots for legacy agreements:

```sql
insert into public.rider_agreement_versions (
  assignment_id, owner_id, version_number, rider_id, tricycle_id,
  agreement_amount, payment_cycle_days, start_date, end_date, is_active
)
select a.id, a.owner_id, 1, a.rider_id, a.tricycle_id,
  a.agreement_amount, a.payment_cycle_days, a.start_date, a.end_date, a.is_active
from public.rider_assignments a
where a.owner_id is not null
  and not exists (
    select 1 from public.rider_agreement_versions v where v.assignment_id = a.id
  );
```

The migration adds restrictive owner policies to narrow earlier permissive policies, but review all existing policies and grants before production. Verify a second authenticated account cannot read or mutate the owner's rows, and confirm unauthenticated requests fail. Never put a service-role key in the browser.

## Storage

The migration creates the private `agreement-evidence` bucket, limits files to 10 MB, and allows image/PDF types. Storage paths must begin with the uploader's Auth UUID. The frontend stores evidence metadata in `agreement_evidence` and opens files through one-hour signed URLs. Verify upload, read, and cross-user denial using two test accounts before using real identity documents or signatures.

## Automated browser reminders

The dashboard currently detects overdue agreements and provides a manual WhatsApp reminder. Browser push still needs backend setup; the local app cannot send reminders while closed.

1. Generate a VAPID public/private key pair. Put only the public key in the Angular environment as `vapidPublicKey`; keep the private key in Supabase Edge Function secrets, never in the frontend.
2. Add a `push_subscriptions` table with `user_id`, unique push endpoint, `p256dh`, `auth`, timestamps, and RLS so a user can manage only their own subscriptions. Ask for notification permission only after an explicit operator action and store the browser subscription.
3. Deploy an authenticated Supabase Edge Function that queries active assignments with `next_due_date` before the current business date, skips agreements paid through that due period, and sends Web Push to active subscriptions. Set up Supabase Cron to invoke it at an agreed local time.
4. Add a reminder-delivery table keyed by agreement and due period. Write an attempt before/with delivery, track success/failure, and enforce uniqueness so retries do not spam operators. Remove expired push subscriptions when a provider returns a gone/invalid response.
5. Configure timezone, grace period, quiet hours, and whether reminders go to the owner, assigned operator, or both. Test permission denied, expired subscriptions, missed/partial payments, inactive agreements, and repeated cron runs.

Push notifications require HTTPS and supported browsers. Keep the in-app overdue list and manual WhatsApp path as fallbacks. A reminder should link back to the app; it should not claim a rider is unpaid until the payment records have been reconciled.