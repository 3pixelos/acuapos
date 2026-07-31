-- ============================================================
-- Beymen POS — July 2026 fixes, part 6 (FAST part only).
-- Run this one in the Supabase SQL Editor — it completes instantly.
--
-- Adds the plaintext-PIN infrastructure (so newly-set PINs show up on the
-- admin screen from now on) and the persisted remise column. Deliberately
-- excludes the slow bcrypt brute-force step from fixes_2026_07f.sql — see
-- the message from the assistant for why, and how to recover old PINs
-- instead (spoiler: you don't need to — just re-set them once).
-- ============================================================
set search_path = public, extensions;

-- ---------- 1. plaintext PIN column + RPCs ----------
alter table staff add column if not exists secret_plain text;

create or replace function staff_set_secret(p_staff_id uuid, p_secret text)
returns void language sql security definer set search_path = public, extensions as $$
  update staff
  set secret_hash = crypt(p_secret, gen_salt('bf')), secret_plain = p_secret
  where id = p_staff_id;
$$;

create or replace function staff_create(
  p_name text, p_username text, p_role text, p_secret text, p_color text
) returns uuid language sql security definer set search_path = public, extensions as $$
  insert into staff (name, username, role, secret_hash, secret_plain, color)
  values (p_name, p_username, p_role, crypt(p_secret, gen_salt('bf')), p_secret, p_color)
  returning id;
$$;

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
    return; -- not an admin / wrong password: empty result
  end if;
  return query select s.id, s.secret_plain from staff s where s.secret_plain is not null;
end $$;

-- ---------- 2. persisted remise ----------
alter table table_sessions add column if not exists discount int not null default 0;
