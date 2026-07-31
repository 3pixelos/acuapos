-- ============================================================
-- Silent kitchen printing: adds a "printed" flag so the print
-- station can claim tickets exactly once. Run once, after schema.sql.
-- ============================================================
alter table order_items add column if not exists printed_at timestamptz;
