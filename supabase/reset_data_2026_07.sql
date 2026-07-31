-- ============================================================
-- Beymen POS — FULL DATA RESET. Wipes every order, payment, session and
-- journal entry so the app starts from zero. Staff, tables and the menu
-- are untouched. THIS CANNOT BE UNDONE — run it only once, right before
-- going live for real.
-- ============================================================
set search_path = public, extensions;

delete from activity_log;
delete from payments;
delete from order_items;
