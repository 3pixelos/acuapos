-- ============================================================
-- Beymen POS — July 2026 fixes. Run once in Supabase SQL Editor.
--
-- 1. Staff edit / deactivate / delete RPCs (the staff table has no anon
--    RLS policies, so the admin UI's direct updates silently did nothing).
-- 2. last_ticket_at on table_sessions — the "en retard" timer now restarts
--    every time a ticket is sent, instead of running from the first ticket.
-- 3. Relabel Salon tables to S1..S22 (Salon VIP unchanged) and Étage 2
--    tables to E1..E19. Ids stay the same, so open sessions are unaffected.
-- ============================================================
set search_path = public, extensions;

-- ---------- 1. staff RPCs ----------
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

-- Hard delete. Fails with a foreign-key error (23503) if the employee is
-- referenced by sessions/payments/journal — the app then tells the admin
-- to deactivate instead.
create or replace function staff_delete(p_staff_id uuid)
returns void language sql security definer set search_path = public, extensions as $$
  delete from staff where id = p_staff_id;
$$;

-- ---------- 2. late timer anchor ----------
alter table table_sessions add column if not exists last_ticket_at timestamptz;
-- backfill open sessions so they don't all flip to "en retard" on deploy
update table_sessions set last_ticket_at = first_ticket_at
where last_ticket_at is null and closed_at is null;

-- ---------- 3. table labels ----------
update restaurant_tables set label = 'S' || sort where layer = 'salon' and not vip;
update restaurant_tables set label = 'E' || sort where layer = 'etage2';
