-- ============================================================
-- Beymen POS — add the menu tables to the realtime publication so menu
-- edits reach running devices instantly (the app also polls as fallback).
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- ============================================================
do $$ begin
  alter publication supabase_realtime add table menu_items;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table menu_categories;
exception when duplicate_object then null; end $$;
