-- ============================================================
-- Acua POS — "Bowls Healthy" belongs to the bar (2026-08-05)
--
-- The barman makes the bowls, not the kitchen. `main` is the print routing
-- AND the menu tab, so flipping it to 'drinks' moves both at once:
--
--   * Berry Bowl and Classic Bowl print on the BAR printer
--   * the category moves from the "Cuisine" tab to "Bar" on the order screen
--
-- Nothing else changes. No item is renamed, repriced, added or removed, and
-- closed orders keep their own snapshot of what was sold, so history and past
-- receipts are untouched.
--
-- The other half of this change is in the app: "Egg Mousse (Bagel)" is a
-- single item inside Sandwichs Signature, whose other four items the kitchen
-- still makes — so it is routed by NAME in BAR_ROUTED_ITEM_NAMES
-- (src/lib/types.ts) rather than by moving its whole category.
--
-- Safe to re-run.
-- ============================================================
set search_path = public, extensions;

update menu_categories
set main = 'drinks'
where name_fr = 'Bowls Healthy';

-- ---------- verify ----------
-- Expect: Bowls Healthy listed under drinks, with its two items.
select c.name_fr as categorie, c.main as station, count(i.id) as items
from menu_categories c
left join menu_items i on i.category_id = c.id
where c.main = 'drinks'
group by c.name_fr, c.main, c.sort
order by c.sort;
