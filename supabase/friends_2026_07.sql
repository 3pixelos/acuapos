-- ============================================================
-- Beymen POS — "Friends" tabs (receivables, NOT revenue).
-- Run once in Supabase SQL Editor.
--
-- The owner's friends eat, get their bill, and pay back later (weeks/
-- months). A Friends bill is recorded as a DEBT owed by a named friend —
-- never as a payment, so it never counts toward revenue until settled.
-- ============================================================
set search_path = public, extensions;

-- ---------- the friends (admin-editable later) ----------
create table if not exists friends (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into friends (name, sort)
select v.name, v.sort
from (values ('Mehdi', 1), ('Saoudi', 2), ('Hamza', 3), ('Hicham', 4), ('Ayoub', 5)) as v(name, sort)
where not exists (select 1 from friends);

-- ---------- one row per bill a friend owes ----------
create table if not exists friend_debts (
  id uuid primary key default gen_random_uuid(),
  friend_id uuid not null references friends(id) on delete cascade,
  session_id uuid references table_sessions(id) on delete set null,
  amount numeric not null,
  method text not null default 'cash' check (method in ('cash', 'card')),
  -- the day the bill was incurred; backlog rows use the 1st of the month
  incurred_on date not null default (now() at time zone 'utc')::date,
  backlog boolean not null default false, -- true = old paper receipt, month-only
  note text,
  settled boolean not null default false, -- true once the friend has paid it back
  settled_at timestamptz,
  settlement_batch uuid,                   -- groups one "mark paid" action
  created_at timestamptz not null default now()
);
create index if not exists idx_friend_debts_friend on friend_debts (friend_id);
create index if not exists idx_friend_debts_open on friend_debts (friend_id) where settled = false;

-- ---------- a Friends bill flags the session ----------
alter table table_sessions add column if not exists friend_id uuid references friends(id);

-- ---------- RLS: same trusted-anon-devices model ----------
alter table friends enable row level security;
alter table friend_debts enable row level security;
create policy anon_all on friends for all to anon using (true) with check (true);
create policy anon_all on friend_debts for all to anon using (true) with check (true);

alter publication supabase_realtime add table friends, friend_debts;
