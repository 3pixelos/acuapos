-- ============================================================
-- Beymen POS — July 2026 fixes, part 3. Run once in Supabase SQL Editor.
--
-- 1. staff_login gains p_force: breaks a stale device lock immediately
--    (the old device is evicted on its next heartbeat) instead of the
--    user having to wait until the phone's dead tab stops beating.
-- 2. staff_verify: check a PIN/password without touching the session —
--    used by the admin cancel-confirmation on the map.
-- 3. table_sessions.cancel_requested: a caisse cancellation no longer
--    frees the table; it stays blocked (red) until an admin confirms.
-- ============================================================
set search_path = public, extensions;

-- ---------- 1. force login ----------
drop function if exists staff_login(text, text);

create or replace function staff_login(p_username text, p_secret text, p_force boolean default false)
returns table (
  id uuid, name text, username text, role text, color text,
  session_token text, denied boolean
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
             null::text, true;
    return;
  end if;

  -- issuing a new token evicts any other device on its next heartbeat
  v_token := encode(gen_random_bytes(16), 'hex');
  update staff set session_token = v_token, session_last_seen = now() where staff.id = v_staff.id;

  return query
    select v_staff.id, v_staff.name, v_staff.username, v_staff.role, v_staff.color,
           v_token, false;
end $$;

-- ---------- 2. secret check (no session side effects) ----------
create or replace function staff_verify(p_staff_id uuid, p_secret text)
returns boolean language sql security definer set search_path = public, extensions as $$
  select exists (
    select 1 from staff
    where id = p_staff_id and active and secret_hash = crypt(p_secret, secret_hash)
  );
$$;

-- ---------- 3. admin-confirmed cancellation ----------
alter table table_sessions add column if not exists cancel_requested boolean not null default false;
