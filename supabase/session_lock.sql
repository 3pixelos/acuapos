-- ============================================================
-- Beymen POS — single-device session lock.
-- One staff account can only be actively logged in on one device at a
-- time. "Active" = a heartbeat seen in the last 25s. Run once, after
-- schema.sql. Safe to run even with staff currently "logged in" (client
-- reload re-authenticates anyway, per the no-persisted-session change).
-- ============================================================

alter table staff add column if not exists session_token text;
alter table staff add column if not exists session_last_seen timestamptz;

drop function if exists staff_login(text, text);

create or replace function staff_login(p_username text, p_secret text)
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
    and (p_username <> '' or s.role = 'waiter')
  limit 1;

  if not found then
    return; -- bad credentials: empty result set
  end if;

  v_busy := v_staff.session_last_seen is not null
    and now() - v_staff.session_last_seen < interval '25 seconds';

  if v_busy then
    return query
      select v_staff.id, v_staff.name, v_staff.username, v_staff.role, v_staff.color,
             null::text, true;
    return;
  end if;

  v_token := encode(gen_random_bytes(16), 'hex');
  update staff set session_token = v_token, session_last_seen = now() where staff.id = v_staff.id;

  return query
    select v_staff.id, v_staff.name, v_staff.username, v_staff.role, v_staff.color,
           v_token, false;
end $$;

-- Called every ~15s by the logged-in client. Returns true only if this
-- device still holds the current session token; false/no-row means another
-- device logged in and this one should be signed out.
create or replace function staff_heartbeat(p_staff_id uuid, p_session_token text)
returns boolean language sql security definer set search_path = public as $$
  update staff set session_last_seen = now()
  where id = p_staff_id and session_token = p_session_token
  returning true;
$$;

-- Explicit logout: frees the account immediately instead of waiting for
-- the 25s heartbeat timeout.
create or replace function staff_logout(p_staff_id uuid, p_session_token text)
returns void language sql security definer set search_path = public as $$
  update staff set session_token = null, session_last_seen = null
  where id = p_staff_id and session_token = p_session_token;
$$;
