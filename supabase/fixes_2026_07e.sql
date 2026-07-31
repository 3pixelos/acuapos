-- ============================================================
-- Beymen POS — July 2026 fixes, part 5. Run once in Supabase SQL Editor.
--
-- 1. server_now(): the app syncs every device to the database clock.
--    The "late instantly" bug was clock skew — timestamps are written by
--    one device (waiter's phone) and judged by another (caisse/admin);
--    a device clock off by an hour makes a fresh ticket look 45+ min old.
-- 2. Hard staff delete: history rows keep existing but drop their staff
--    reference (name shows as "—"), so delete always succeeds.
-- ============================================================
set search_path = public, extensions;

-- ---------- 1. shared clock ----------
create or replace function server_now()
returns timestamptz language sql stable as $$ select now() $$;

-- ---------- 2. hard staff delete ----------
alter table table_sessions alter column waiter_id drop not null;

create or replace function staff_delete(p_staff_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  update table_sessions set waiter_id = null where waiter_id = p_staff_id;
  update payments set cashier_id = null where cashier_id = p_staff_id;
  update activity_log set staff_id = null where staff_id = p_staff_id;
  delete from staff where id = p_staff_id;
end $$;
