-- ============================================================
-- Beymen POS — credit the SERVER, not whoever last held the table.
-- Run once in Supabase SQL Editor.
--
-- The caisse "takes control" of a table to print/settle, which reassigned
-- waiter_id and moved the whole sale onto the cashier's tally (so the
-- waiter who actually served showed 0). server_id is locked to the seating
-- waiter and only moves on a genuine waiter-to-waiter handoff — never when
-- the caisse takes control. All revenue-per-employee stats read server_id.
-- ============================================================
set search_path = public, extensions;

alter table table_sessions add column if not exists server_id uuid references staff(id);

-- backfill history: credit the current waiter_id (best guess for old rows)
update table_sessions set server_id = waiter_id where server_id is null;
