-- ============================================================
-- Beymen POS — "Relevé de ventes" print authorisations.
-- Run once in the Supabase SQL Editor.
--
-- The caisse can't print a sales report on its own: it files a request
-- here, the admin approves it, and only then does the print button unlock.
-- One row per request; `period_key` identifies exactly what was asked for
-- so an approval can't be reused for a different period.
-- ============================================================
set search_path = public, extensions;

create table if not exists report_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references staff(id) on delete set null,
  requester_name text not null default '',
  scope text not null,                 -- 'day' | 'week' | 'month'
  period_key text not null,            -- '2026-07-21' | '2026-W30' | '2026-07'
  period_label text not null default '',
  status text not null default 'pending', -- pending | approved | denied | printed
  decided_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  printed_at timestamptz
);

create index if not exists idx_report_requests_status
  on report_requests (status, created_at desc);

alter table report_requests enable row level security;

do $$ begin
  create policy anon_all on report_requests for all to anon using (true) with check (true);
exception when duplicate_object then null; end $$;

-- live updates so the admin sees a request instantly and the caisse sees
-- the approval without refreshing
do $$ begin
  alter publication supabase_realtime add table report_requests;
exception when duplicate_object then null; end $$;
