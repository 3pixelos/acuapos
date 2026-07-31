-- ============================================================
-- Beymen POS — server-side guard against duplicate FULL payments.
-- Run once in Supabase SQL Editor.
--
-- The caisse pay buttons already block a double-tap in-flight, but a device
-- on a stale bundle (or a flaky-Wi-Fi retry) could still fire the same full
-- payment twice — the "905 paid as 1810" bug. This trigger drops a second
-- identical FULL payment for the same table within a few seconds.
--
-- Only kind='full' is deduped. Split payments (equal / by item) are
-- deliberately repeated (e.g. four people each pay 250), so they're exempt.
-- ============================================================
set search_path = public, extensions;

create or replace function drop_duplicate_full_payment()
returns trigger
language plpgsql as $$
begin
  -- A bill is settled by exactly ONE 'full' payment (it pays the whole
  -- remaining balance). So a SECOND 'full' payment on the same table shortly
  -- after the first is always a double-tap / flaky-Wi-Fi retry — drop it.
  -- No amount/method match required (the retry may differ), and a wide 5-min
  -- window so a slow retry can't slip through; a genuine reopen-and-repay
  -- happens far later than that. Split payments (equal / by item) are exempt.
  if new.kind = 'full' and exists (
    select 1 from payments p
    where p.session_id = new.session_id
      and p.kind = 'full'
      and p.created_at > now() - interval '5 minutes'
  ) then
    return null; -- silently drop the duplicate (the real one already landed)
  end if;
  return new;
end $$;

drop trigger if exists trg_dedup_full_payment on payments;
create trigger trg_dedup_full_payment
  before insert on payments
  for each row execute function drop_duplicate_full_payment();
