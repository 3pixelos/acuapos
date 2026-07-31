-- ============================================================================
-- Un-merge support (undo a table join, restoring each table's own items)
-- ----------------------------------------------------------------------------
-- Run this once in the Supabase SQL editor. Until it runs, joining still works
-- exactly as before and the "Séparer les tables" button simply won't appear
-- (the app writes these columns best-effort and ignores "column not found").
--
--  * order_items.origin_table_id  — which physical table a line belongs to,
--    stamped when tables are joined so the split can hand it back.
--  * table_sessions.merge_parts    — snapshot of the joined sub-tables
--    ([{ primary, table_ids, covers }, ...]) so the merge can be undone.
-- ============================================================================

alter table order_items
  add column if not exists origin_table_id text;

alter table table_sessions
  add column if not exists merge_parts jsonb;
