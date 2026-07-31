-- ============================================================
-- Beymen POS — availability (rupture de stock) toggling.
-- Run once in the Supabase SQL Editor.
--
-- menu_items only had a SELECT policy for the anon key, so the app's
-- availability switch would silently update 0 rows without this.
-- ============================================================
set search_path = public, extensions;

do $$ begin
  create policy anon_update on menu_items for update to anon using (true) with check (true);
exception when duplicate_object then null; end $$;
