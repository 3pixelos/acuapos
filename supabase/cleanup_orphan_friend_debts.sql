-- ============================================================
-- Beymen POS — remove friend debts whose order no longer exists.
--
-- The admin "delete order" tool used to leave the friend_debts row behind:
-- the session was deleted, the FK nulled session_id, and the friend was
-- still shown as owing the money. The tool now deletes the debt too; this
-- clears the ones stranded before that fix.
--
-- Backlog rows are NOT touched: they legitimately have no session (they
-- come from old paper receipts), which is what `and not backlog` protects.
-- ============================================================
set search_path = public, extensions;

delete from friend_debts
where session_id is null
  and not backlog;
