-- ============================================================
-- Acua POS — remove NOCCO BCAA Miami Strawberry (2026-08-06)
--
-- Added by acua_vitamin_drinks_2026_08_06.sql; not wanted after all. That
-- file has been corrected too, so re-running it will not bring it back.
--
-- Removing a menu item does NOT touch order history: order_items keep their
-- own copy of the name, price and category from the moment of the sale, so
-- past receipts, the journal and the revenue figures all stay exactly as they
-- were. Its per-item stock row cascades away with it.
--
-- Safe to re-run: deleting something already gone is a no-op.
-- ============================================================
set search_path = public, extensions;

delete from menu_items mi
using menu_categories c
where c.id = mi.category_id
  and c.name_fr = 'Boissons Vitaminées'
  and mi.name = 'NOCCO BCAA Miami Strawberry';

-- ---------- verify ----------
-- Expect the 5 Vitamin Well bottles, no NOCCO.
select mi.sort, mi.name, mi.price
from menu_items mi
join menu_categories c on c.id = mi.category_id
where c.name_fr = 'Boissons Vitaminées'
order by mi.sort;
