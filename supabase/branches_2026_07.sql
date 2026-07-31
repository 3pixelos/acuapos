-- ============================================================
-- Beymen POS — multi-branch (Iberia + Playa).
--
-- Model: a single `branch` text discriminator on the tables that carry
-- per-branch operational data. Everything that already exists belongs to
-- Iberia, so every column backfills to 'iberia' and is NOT NULL after —
-- there is no such thing as a branch-less session or table.
--
-- Deliberately NOT branched:
--   * menu_categories / menu_items — one brand, one menu, one price list.
--     Branching the menu would double every future price edit. If Playa
--     ever needs its own prices, add branch here and scope the same way.
--   * order_items / payments — they hang off a session (FK, cascade), so
--     their branch is the session's branch. Denormalising it here would
--     only create a second copy that can drift out of sync.
--   * friends — the owner's personal guest list, shared by both branches.
--     The DEBT is branched (friend_debts.branch) so each branch's
--     receivables can be reported separately.
--
-- Safe to re-run.
-- ============================================================

-- ---------- 1. branch columns ----------
alter table staff             add column if not exists branch text;
alter table restaurant_tables add column if not exists branch text;
alter table table_sessions    add column if not exists branch text;
alter table activity_log      add column if not exists branch text;
alter table friend_debts      add column if not exists branch text;
alter table report_requests   add column if not exists branch text;

-- ---------- 2. backfill: all existing data is Iberia ----------
update staff             set branch = 'iberia' where branch is null;
update restaurant_tables set branch = 'iberia' where branch is null;
update table_sessions    set branch = 'iberia' where branch is null;
update activity_log      set branch = 'iberia' where branch is null;
update friend_debts      set branch = 'iberia' where branch is null;
update report_requests   set branch = 'iberia' where branch is null;

-- ---------- 3. lock the invariant in ----------
-- One DO block PER table on purpose: an exception rolls back everything in
-- its block, so sharing one would undo the earlier ALTERs whenever a later
-- table failed.
do $$ begin alter table staff             alter column branch set not null;
exception when others then null; end $$;
do $$ begin alter table restaurant_tables alter column branch set not null;
exception when others then null; end $$;
do $$ begin alter table table_sessions    alter column branch set not null;
exception when others then null; end $$;
do $$ begin alter table activity_log      alter column branch set not null;
exception when others then null; end $$;
do $$ begin alter table friend_debts      alter column branch set not null;
exception when others then null; end $$;

alter table staff             alter column branch set default 'iberia';
alter table restaurant_tables alter column branch set default 'iberia';
alter table table_sessions    alter column branch set default 'iberia';
alter table activity_log      alter column branch set default 'iberia';
alter table friend_debts      alter column branch set default 'iberia';
alter table report_requests   alter column branch set default 'iberia';

do $$
begin
  alter table staff add constraint staff_branch_chk check (branch in ('iberia','playa'));
exception when duplicate_object then null; end $$;
do $$
begin
  alter table restaurant_tables add constraint rt_branch_chk check (branch in ('iberia','playa'));
exception when duplicate_object then null; end $$;
do $$
begin
  alter table table_sessions add constraint ts_branch_chk check (branch in ('iberia','playa'));
exception when duplicate_object then null; end $$;

-- Every branch-scoped read filters on branch — index the hot paths.
create index if not exists idx_sessions_branch      on table_sessions (branch, closed_at);
create index if not exists idx_sessions_branch_clos on table_sessions (branch, closed_at desc);
create index if not exists idx_tables_branch        on restaurant_tables (branch, layer, sort);
create index if not exists idx_activity_branch      on activity_log (branch, at desc);
create index if not exists idx_debts_branch         on friend_debts (branch, settled);

-- ---------- 4. Playa floor plan ----------
-- Mirrors the Iberia layout so Playa opens with a working map, with one
-- difference: Playa has no terrace — that room is a VIP SALON instead. It
-- is an ordinary room for ordering purposes (the 'vip' flag stays as-is);
-- only the layer it lives on differs.
--
-- Ids are prefixed 'P-' because restaurant_tables.id is the text PK and must
-- stay globally unique; the LABEL stays the human 'T1'/'S4'/'E7' the staff
-- say out loud, so both branches read identically on screen.
insert into restaurant_tables (id, label, seats, zone, layer, sort, vip, x, y, branch)
select
  'P-' || t.id,
  t.label,
  t.seats,
  case when t.layer = 'terrasse' then 'VIP Salon' else t.zone end,
  case when t.layer = 'terrasse' then 'vipsalon' else t.layer end,
  t.sort, t.vip, t.x, t.y, 'playa'
from restaurant_tables t
where t.branch = 'iberia'
on conflict (id) do nothing;

-- Corrective, in case an earlier run of this file created Playa's terrace
-- before the VIP-salon decision. Playa must never have a 'terrasse' layer.
update restaurant_tables
   set layer = 'vipsalon', zone = 'VIP Salon'
 where branch = 'playa' and layer = 'terrasse';

-- ---------- 5. auth: branch travels with the login ----------
drop function if exists staff_login(text, text, boolean);

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
    return; -- bad credentials: empty result set
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

-- staff_public gains branch so the admin staff tab can show/group it.
drop view if exists staff_public;
create or replace view staff_public
  with (security_invoker = off) as
  select id, name, username, role, color, active, branch from staff;
grant select on staff_public to anon;

-- Create staff INTO a branch (defaults to Iberia when omitted, so the
-- existing 5-arg call sites keep working).
create or replace function staff_create(
  p_name text, p_username text, p_role text, p_secret text, p_color text,
  p_branch text default 'iberia'
) returns uuid language sql security definer set search_path = public, extensions as $$
  insert into staff (name, username, role, secret_hash, secret_plain, color, branch)
  values (p_name, p_username, p_role, crypt(p_secret, gen_salt('bf')), p_secret, p_color,
          coalesce(nullif(p_branch, ''), 'iberia'))
  returning id;
$$;

-- Admin-only: move an employee to the other branch. Takes effect on their
-- NEXT login/refresh — in-flight sessions keep the branch they opened in,
-- which is what you want (a night's orders don't teleport mid-service).
create or replace function staff_set_branch(p_staff_id uuid, p_branch text)
returns void language sql security definer set search_path = public as $$
  update staff set branch = p_branch
  where id = p_staff_id and p_branch in ('iberia','playa');
$$;
