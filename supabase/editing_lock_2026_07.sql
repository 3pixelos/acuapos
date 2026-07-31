-- ============================================================
-- Beymen POS — "someone is ordering here" lock.
-- Run once in the Supabase SQL editor.
--
-- When a waiter (or the caisse) has a table's ORDER screen open, the app
-- heartbeats `editing_at` every few seconds and stamps `editing_by` with
-- who it is. Another person trying to jump into (take over) that table is
-- blocked while the lock is fresh — so an active order is never interrupted
-- mid-typing. The lock auto-releases a few seconds after they close the
-- screen (or their device sleeps / drops off), because the heartbeat stops
-- and `editing_at` goes stale. No lock is permanent.
--
-- Both columns are nullable and default null, so the app keeps working
-- exactly as before until it starts writing them.
-- ============================================================
alter table table_sessions
  add column if not exists editing_by uuid references staff(id) on delete set null;
alter table table_sessions
  add column if not exists editing_at timestamptz;
