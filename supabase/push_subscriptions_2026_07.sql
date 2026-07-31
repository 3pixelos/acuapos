-- ============================================================
-- Beymen POS — Web Push subscriptions. Run once in Supabase SQL Editor.
--
-- Each admin device that turns on notifications stores its push endpoint
-- here, tied to the admin's staff row. The /api/notify serverless function
-- reads these (admins only) and sends a Web Push when a table cancellation
-- or a print authorisation is requested.
-- ============================================================
set search_path = public, extensions;

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;
-- Same trusted-anon-devices model as the rest of the app.
create policy anon_all on push_subscriptions for all to anon using (true) with check (true);
