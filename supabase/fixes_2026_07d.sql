-- ============================================================
-- Beymen POS — July 2026 fixes, part 4. Run once in Supabase SQL Editor.
--
-- Show staff PINs on the admin staff screen. bcrypt hashes are one-way,
-- so a plaintext copy is kept from now on (secret_plain, written by
-- staff_create / staff_set_secret). Existing PINs stay unknown until
-- they're set again once. Reading them requires re-proving the admin's
-- own password (staff_secrets RPC) — the anon key alone is not enough.
-- Login still verifies against the hash only.
-- ============================================================
set search_path = public, extensions;

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
