-- ============================================================
-- Beymen POS — friends tabs move to the 05:00 SERVICE day.
-- Run once in the Supabase SQL Editor.
--
-- `friend_debts.incurred_on` used to be stamped with the plain CALENDAR
-- date, so a tab booked at 01:30 landed on the day that had just started
-- instead of the night that was still running. Revenue, staff meals and VIP
-- all already use the 05:00 → 05:00 service day, so the friends figure was
-- the only one out of step: after-midnight tabs fell out of "today" and
-- reappeared in "tomorrow".
--
-- The app now writes the service day (see recordFriendDebt). This backfills
-- the rows written before that.
--
-- Backlog rows are deliberately parked on the 1st of their month and are
-- NOT touched.
-- ============================================================
set search_path = public, extensions;

-- Morocco is UTC+1 all year (no DST since 2018); naming the zone keeps this
-- correct regardless of the database's own timezone setting.
-- Service day = the calendar date of (local time − 5 hours).
with fixed as (
  select
    id,
    incurred_on as was,
    ((created_at at time zone 'Africa/Casablanca') - interval '5 hours')::date as should_be
  from friend_debts
  where backlog = false
)
update friend_debts d
set incurred_on = f.should_be
from fixed f
where d.id = f.id
  and f.was is distinct from f.should_be;

-- What moved (run this after, to see the effect):
--   select incurred_on, count(*), sum(amount)
--   from friend_debts where backlog = false
--   group by 1 order by 1 desc limit 30;
