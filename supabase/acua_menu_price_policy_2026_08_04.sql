-- ============================================================
-- Acua POS — let the app edit menu prices (2026-08-04)
--
-- THE BUG: editing a price in Admin -> Stock & Prix appeared to work and
-- then snapped back to the old value. `menu_items` had RLS enabled with only
-- a SELECT policy for the app's role, so every UPDATE matched zero rows.
-- Postgres does not treat that as an error — it is "you updated the rows you
-- were allowed to update, which was none" — so PostgREST returned 200, the
-- client saw no error, and the next refresh restored the old price.
--
-- Menu prices are the one thing the owner is expected to change from inside
-- the app, so the policy was simply missing.
--
-- Scope: UPDATE only. The menu's shape (which items and categories exist)
-- still comes from a migration, not from the app, so INSERT and DELETE stay
-- closed. This matches how every other operational table here is exposed.
--
-- Idempotent: safe to re-run.
-- ============================================================
set search_path = public, extensions;

do $$ begin
  create policy anon_update on menu_items
    for update to anon using (true) with check (true);
exception when duplicate_object then null; end $$;

-- ---------- verify ----------
-- Expect a row for cmd = 'UPDATE' alongside the existing SELECT one.
select polname as policy, cmd
from pg_policy p
join pg_class c on c.oid = p.polrelid
join (values ('r','SELECT'),('a','INSERT'),('w','UPDATE'),('d','DELETE'),('*','ALL'))
     as m(k, cmd) on m.k = p.polcmd::text
where c.relname = 'menu_items'
order by cmd;
