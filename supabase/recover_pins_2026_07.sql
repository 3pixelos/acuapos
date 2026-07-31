-- ============================================================
-- Beymen POS — recover missing staff PINs for the admin screen.
--
-- fixes_2026_07f_fast.sql added the plaintext-PIN column but SKIPPED the
-- slow recovery step, so any staff whose PIN was never re-set since then
-- shows "—" instead of their code on the admin Personnel screen. bcrypt is
-- one-way, so the only way back is to test all 10 000 four-digit codes
-- against each stored hash. Covers waiters AND cashiers (both use 4-digit
-- PINs); admins keep their password and are left alone.
--
-- HOW TO RUN
--   1. Paste everything below and run it once (creates the procedure).
--   2. Run:  call recover_all_pins();
--      It recovers each staff and COMMITS as it goes, so a statement
--      timeout never loses progress — if it stops early, just run
--      `call recover_all_pins();` again and it picks up where it left off.
--   bcrypt is slow on purpose: expect up to a couple of minutes.
-- ============================================================
set search_path = public, extensions;

create or replace procedure recover_all_pins()
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
  g int;
  guess text;
begin
  for r in
    select id, secret_hash from staff
    where secret_plain is null and role <> 'admin'
  loop
    for g in 0..9999 loop
      guess := lpad(g::text, 4, '0');
      if crypt(guess, r.secret_hash) = r.secret_hash then
        update staff set secret_plain = guess where id = r.id;
        exit;
      end if;
    end loop;
    commit; -- persist this staff before moving on (survives a timeout)
  end loop;
end $$;

-- run this:
call recover_all_pins();
