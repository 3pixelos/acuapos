-- ============================================================
-- Acua POS — consolidated schema. Run ONCE in the Supabase SQL Editor of the
-- NEW Acua project (Phase 2). Single location: the `branch` discriminator is
-- kept for schema parity with the app, but only ever holds 'main'.
--
-- Produces the same table structure, RPCs, RLS and realtime as the Beymen
-- build, minus every Beymen-specific data seed. Structure and staff only —
-- run acua_menu_floor_2026_08.sql straight after this for the real menu and
-- the real floor plan.
-- Idempotent: safe to re-run.
-- ============================================================
create extension if not exists pgcrypto with schema extensions;
set search_path = public, extensions;

-- ---------- staff ----------
create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  username text not null unique,
  role text not null check (role in ('waiter', 'cashier', 'admin')),
  secret_hash text not null,                    -- bcrypt PIN / password
  secret_plain text,                            -- shown on admin screen only via RPC
  color text not null default '#78716C',
  active boolean not null default true,
  session_token text,
  session_last_seen timestamptz,
  branch text not null default 'main' check (branch = 'main'),
  created_at timestamptz not null default now()
);

-- ---------- fixed floor plan ----------
create table if not exists restaurant_tables (
  id text primary key,
  label text not null,
  seats int not null,
  zone text not null,
  layer text,                                   -- frontdoor | salon | terrasse | bar | emporter
  sort int not null default 0,
  vip boolean not null default false,
  x numeric not null,
  y numeric not null,
  branch text not null default 'main' check (branch = 'main')
);

-- ---------- live sessions ----------
create table if not exists table_sessions (
  id uuid primary key default gen_random_uuid(),
  table_ids text[] not null,
  waiter_id uuid references staff(id),
  covers int not null,
  status text not null default 'waiting' check (status in ('waiting', 'preparing', 'served')),
  seated_at timestamptz not null default now(),
  first_ticket_at timestamptz,
  served_at timestamptz,
  closed_at timestamptz,
  cancelled boolean not null default false,
  cancel_reason text,
  cancel_requested boolean not null default false,
  ticket_seq int not null default 0,
  locked boolean not null default false,
  last_ticket_at timestamptz,
  discount int not null default 0,
  server_id uuid references staff(id),
  vip_name text,
  staff_order boolean not null default false,
  friend_id uuid,                               -- FK added after friends table
  merge_parts jsonb,
  editing_by uuid references staff(id),
  editing_at timestamptz,
  branch text not null default 'main' check (branch = 'main')
);
create index if not exists idx_sessions_open on table_sessions (closed_at) where closed_at is null;
create index if not exists idx_sessions_branch on table_sessions (branch, closed_at);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references table_sessions(id) on delete cascade,
  menu_item_id uuid,
  name text not null,
  price numeric not null,
  qty int not null default 1,
  note text not null default '',
  category text not null default '',
  ticket_no int,
  voided boolean not null default false,
  void_reason text,
  payment_id uuid,
  paid_qty int not null default 0,
  origin_table_id text,
  printed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_items_session on order_items (session_id);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references table_sessions(id) on delete cascade,
  cashier_id uuid references staff(id),
  method text not null check (method in ('cash', 'card')),
  amount numeric not null,
  kind text not null default 'full' check (kind in ('full', 'equal', 'items')),
  created_at timestamptz not null default now()
);

-- ---------- menu (developer / client-managed) ----------
create table if not exists menu_categories (
  id uuid primary key default gen_random_uuid(),
  name_fr text not null,
  name_en text not null,
  name_es text,
  -- 'food' (prints in the KITCHEN) or 'drinks' (prints at the BAR).
  main text not null default '',
  sort int not null default 0
);
alter table menu_categories add column if not exists name_es text;

create table if not exists menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references menu_categories(id) on delete cascade,
  name text not null,
  description text not null default '',
  price numeric not null,
  available boolean not null default true,
  sort int not null default 0
);

-- per-item availability ("rupture de stock"); missing row => available
create table if not exists menu_stock (
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  branch text not null default 'main' check (branch = 'main'),
  available boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (menu_item_id, branch)
);

-- ---------- friends (owner's guest list) + their tabs ----------
create table if not exists friends (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists friend_debts (
  id uuid primary key default gen_random_uuid(),
  friend_id uuid not null references friends(id),
  session_id uuid references table_sessions(id),
  amount numeric not null,
  method text not null default 'cash' check (method in ('cash', 'card')),
  incurred_on date not null default ((now() at time zone 'utc')::date),
  backlog boolean not null default false,
  note text,
  settled boolean not null default false,
  settled_at timestamptz,
  settlement_batch uuid,
  branch text not null default 'main' check (branch = 'main'),
  created_at timestamptz not null default now()
);
create index if not exists idx_debts_branch on friend_debts (branch, settled);

-- table_sessions.friend_id FK (friends now exists)
do $$ begin
  alter table table_sessions add constraint table_sessions_friend_id_fkey
    foreign key (friend_id) references friends(id);
exception when duplicate_object then null; end $$;

-- ---------- audit ----------
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff(id),
  action text not null,
  table_ref text not null default '',
  detail jsonb not null default '{}',
  at timestamptz not null default now(),
  branch text not null default 'main' check (branch = 'main')
);
create index if not exists idx_activity_branch on activity_log (branch, at desc);

-- ---------- sales-report print authorisations ----------
create table if not exists report_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references staff(id),
  requester_name text not null default '',
  scope text not null,
  period_key text not null,
  period_label text not null default '',
  status text not null default 'pending',
  decided_by uuid references staff(id),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  printed_at timestamptz,
  branch text default 'main'
);

-- ---------- web-push subscriptions (admin devices) ----------
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff(id),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Auth + admin RPCs (security definer; hashes never leave the DB).
-- ============================================================
create or replace function server_now()
returns timestamptz language sql stable as $$ select now() $$;

create or replace function staff_login(p_username text, p_secret text, p_force boolean default false)
returns table (
  id uuid, name text, username text, role text, color text,
  branch text, session_token text, denied boolean
)
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_staff staff%rowtype;
  v_busy boolean;
  v_token text;
begin
  select * into v_staff
  from staff s
  where s.active
    and (p_username = '' or s.username = p_username)
    and s.secret_hash = crypt(p_secret, s.secret_hash)
    and (p_username <> '' or s.role in ('waiter', 'cashier'))
  limit 1;

  if not found then
    return;
  end if;

  v_busy := v_staff.session_last_seen is not null
    and now() - v_staff.session_last_seen < interval '25 seconds';

  if v_busy and not p_force then
    return query
      select v_staff.id, v_staff.name, v_staff.username, v_staff.role, v_staff.color,
             v_staff.branch, null::text, true;
    return;
  end if;

  v_token := encode(gen_random_bytes(16), 'hex');
  update staff set session_token = v_token, session_last_seen = now() where staff.id = v_staff.id;

  return query
    select v_staff.id, v_staff.name, v_staff.username, v_staff.role, v_staff.color,
           v_staff.branch, v_token, false;
end $$;

create or replace function staff_heartbeat(p_staff_id uuid, p_session_token text)
returns boolean language sql security definer set search_path = public as $$
  update staff set session_last_seen = now()
  where id = p_staff_id and session_token = p_session_token
  returning true;
$$;

create or replace function staff_logout(p_staff_id uuid, p_session_token text)
returns void language sql security definer set search_path = public as $$
  update staff set session_token = null, session_last_seen = null
  where id = p_staff_id and session_token = p_session_token;
$$;

create or replace function staff_verify(p_staff_id uuid, p_secret text)
returns boolean language sql security definer set search_path = public, extensions as $$
  select exists (
    select 1 from staff
    where id = p_staff_id and active and secret_hash = crypt(p_secret, secret_hash)
  );
$$;

create or replace function staff_set_secret(p_staff_id uuid, p_secret text)
returns void language sql security definer set search_path = public, extensions as $$
  update staff
  set secret_hash = crypt(p_secret, gen_salt('bf')), secret_plain = p_secret
  where id = p_staff_id;
$$;

create or replace function staff_create(
  p_name text, p_username text, p_role text, p_secret text, p_color text,
  p_branch text default 'main'
) returns uuid language sql security definer set search_path = public, extensions as $$
  insert into staff (name, username, role, secret_hash, secret_plain, color, branch)
  values (p_name, p_username, p_role, crypt(p_secret, gen_salt('bf')), p_secret, p_color, 'main')
  returning id;
$$;

create or replace function staff_update(
  p_staff_id uuid, p_name text, p_username text, p_role text, p_color text
) returns void language sql security definer set search_path = public, extensions as $$
  update staff
  set name = p_name, username = p_username, role = p_role, color = p_color
  where id = p_staff_id;
$$;

create or replace function staff_set_active(p_staff_id uuid, p_active boolean)
returns void language sql security definer set search_path = public, extensions as $$
  update staff set active = p_active where id = p_staff_id;
$$;

-- Kept for API parity; single-location so it only ever sets 'main'.
create or replace function staff_set_branch(p_staff_id uuid, p_branch text)
returns void language sql security definer set search_path = public as $$
  update staff set branch = 'main' where id = p_staff_id;
$$;

-- Hard delete that never fails: history rows drop their staff reference.
create or replace function staff_delete(p_staff_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  update table_sessions set waiter_id = null where waiter_id = p_staff_id;
  update payments set cashier_id = null where cashier_id = p_staff_id;
  update activity_log set staff_id = null where staff_id = p_staff_id;
  delete from staff where id = p_staff_id;
end $$;

-- All staff secrets, gated on the requesting admin's own password.
create or replace function staff_secrets(p_admin_id uuid, p_admin_secret text)
returns table (id uuid, secret text)
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (
    select 1 from staff a
    where a.id = p_admin_id and a.active and a.role = 'admin'
      and a.secret_hash = crypt(p_admin_secret, a.secret_hash)
  ) then
    return;
  end if;
  return query select s.id, s.secret_plain from staff s where s.secret_plain is not null;
end $$;

-- ============================================================
-- RLS: anon key on trusted restaurant devices. staff hashes never readable
-- directly (only via RPC + the safe view). Every other operational table is
-- open to the anon role, exactly as on the Beymen build.
-- ============================================================
alter table staff enable row level security;
alter table restaurant_tables enable row level security;
alter table table_sessions enable row level security;
alter table order_items enable row level security;
alter table payments enable row level security;
alter table menu_categories enable row level security;
alter table menu_items enable row level security;
alter table menu_stock enable row level security;
alter table friends enable row level security;
alter table friend_debts enable row level security;
alter table activity_log enable row level security;
alter table report_requests enable row level security;
alter table push_subscriptions enable row level security;

-- staff: NO anon policies -> only via RPCs and this read-safe view
drop view if exists staff_public;
create or replace view staff_public
  with (security_invoker = off) as
  select id, name, username, role, color, active, branch from staff;
grant select on staff_public to anon;

do $$ begin
  create policy anon_all on restaurant_tables for all to anon using (true) with check (true);
  create policy anon_all on table_sessions for all to anon using (true) with check (true);
  create policy anon_all on order_items for all to anon using (true) with check (true);
  create policy anon_all on payments for all to anon using (true) with check (true);
  create policy anon_read on menu_categories for select to anon using (true);
  create policy anon_read on menu_items for select to anon using (true);
  create policy anon_all on menu_stock for all to anon using (true) with check (true);
  create policy anon_all on friends for all to anon using (true) with check (true);
  create policy anon_all on friend_debts for all to anon using (true) with check (true);
  create policy anon_all on activity_log for all to anon using (true) with check (true);
  create policy anon_all on report_requests for all to anon using (true) with check (true);
  create policy anon_all on push_subscriptions for all to anon using (true) with check (true);
exception when duplicate_object then null; end $$;

-- Realtime — every table the app subscribes to live.
do $$ begin
  alter publication supabase_realtime add table
    table_sessions, order_items, payments, staff,
    menu_categories, menu_items, menu_stock,
    friends, friend_debts, activity_log, report_requests, restaurant_tables;
exception when duplicate_object then null; end $$;

-- ============================================================
-- Seed: default staff only. The floor plan and the menu come from
-- acua_menu_floor_2026_08.sql, which is the single source of truth for both.
-- CHANGE THESE PINS/PASSWORDS before going live.
-- ============================================================
insert into staff (name, username, role, secret_hash, secret_plain, color, branch) values
  ('Admin',   'admin',   'admin',   crypt('admin1234', gen_salt('bf')), 'admin1234', '#8B5CF6', 'main'),
  ('Caisse',  'caisse',  'cashier', crypt('caisse123', gen_salt('bf')), 'caisse123', '#0EA5E9', 'main'),
  ('Serveur 1', 'serveur1', 'waiter', crypt('1111', gen_salt('bf')), '1111', '#F59E0B', 'main'),
  ('Serveur 2', 'serveur2', 'waiter', crypt('2222', gen_salt('bf')), '2222', '#EC4899', 'main')
on conflict (username) do nothing;

-- The real floor plan and the real menu both live in
-- supabase/acua_menu_floor_2026_08.sql — run that straight after this file.
-- Nothing is seeded here on purpose, so the two can never disagree.
