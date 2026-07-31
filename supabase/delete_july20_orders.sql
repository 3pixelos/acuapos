-- ============================================================
-- Beymen POS — delete EVERY order made on the 20th of July 2026
-- (Morocco time, UTC+1: from 2026-07-19 23:00 UTC onward), with all
-- traces: payments, items, sessions, and journal entries.
--
-- ⚠ Run this BEFORE real service starts on the 20th — it deletes
-- EVERYTHING seated on that date, with no way to tell test from real.
-- Irreversible.
-- ============================================================
set search_path = public, extensions;

delete from payments where session_id in (
  select id from table_sessions
  where seated_at >= '2026-07-19T23:00:00Z' and seated_at < '2026-07-20T23:00:00Z'
);

delete from order_items where session_id in (
  select id from table_sessions
  where seated_at >= '2026-07-19T23:00:00Z' and seated_at < '2026-07-20T23:00:00Z'
);

delete from table_sessions
where seated_at >= '2026-07-19T23:00:00Z' and seated_at < '2026-07-20T23:00:00Z';

delete from activity_log
where at >= '2026-07-19T23:00:00Z' and at < '2026-07-20T23:00:00Z';
