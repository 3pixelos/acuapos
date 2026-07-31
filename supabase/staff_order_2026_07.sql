-- ============================================================
-- Beymen POS — "Staff" orders. Run once in Supabase SQL Editor.
--
-- A staff order gets an automatic 40% remise AND is kept OUT of the main
-- revenue figures (headline, cash/card, per-day chart, employee pie) — it
-- shows in its own "Staff" analytic instead, like VIP. A plain -40% remise
-- (staff_order = false) still counts as normal revenue; the flag is what
-- separates the two.
-- ============================================================
set search_path = public, extensions;

alter table table_sessions add column if not exists staff_order boolean not null default false;
