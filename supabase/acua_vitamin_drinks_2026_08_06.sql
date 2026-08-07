-- ============================================================
-- Acua POS — Vitamin Well + NOCCO on the bar menu (2026-08-06)
--
-- Five bottled drinks from the House of Nutrition delivery, all at 5,00 €.
-- They go in their own bar category, so `main = 'drinks'` puts them under the
-- BAR tab and prints them on the bar printer, like everything else there.
--
-- The flavour goes in `description` rather than the name: the name is what
-- gets shouted across a bar and printed in big letters on the ticket, and
-- "Vitamin Well Boost" is what someone asks for.
--
-- Purely additive — no existing category or item is touched. Safe to re-run.
-- ============================================================
set search_path = public, extensions;

begin;

-- Sits after the other drinks categories.
insert into menu_categories (name_fr, name_en, name_es, main, sort)
select 'Boissons Vitaminées', 'Vitamin Drinks', 'Bebidas Vitaminadas', 'drinks',
       coalesce((select max(sort) from menu_categories), 0) + 1
where not exists (select 1 from menu_categories where name_fr = 'Boissons Vitaminées');

insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.descr, 5.00, v.sort
from (values
  ('Vitamin Well Boost',        'Myrtille / framboise · 0,5 L', 1),
  ('Vitamin Well Sport',        '0,5 L',                        2),
  ('Vitamin Well Antioxidant',  'Pêche · 0,5 L',                3),
  ('Vitamin Well Zero Lemon',   'Citron, sans sucre · 0,5 L',   4),
  ('Vitamin Well Zero Peach',   'Pêche, sans sucre · 0,5 L',    5)
  -- NOCCO BCAA Miami Strawberry was here and was dropped the same day
  -- (see acua_remove_nocco_2026_08_06.sql). Removed from this list too, so
  -- re-running this file cannot quietly bring it back.
) as v(name, descr, sort)
join menu_categories c on c.name_fr = 'Boissons Vitaminées'
where not exists (
  select 1 from menu_items mi where mi.category_id = c.id and mi.name = v.name
);

commit;

-- ---------- verify ----------
-- Expect 5 items at 5,00 €, all sellable (no menu_stock row = available).
select mi.sort, mi.name, mi.description, mi.price,
       coalesce(ms.available, true) as disponible
from menu_items mi
join menu_categories c on c.id = mi.category_id
left join menu_stock ms on ms.menu_item_id = mi.id
where c.name_fr = 'Boissons Vitaminées'
order by mi.sort;
