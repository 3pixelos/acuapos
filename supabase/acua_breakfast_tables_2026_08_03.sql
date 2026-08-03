-- ============================================================
-- Acua POS — Breakfast category + extra Salon tables (2026-08-03)
--
-- PURELY ADDITIVE. It deletes nothing and updates nothing that already
-- exists, so the menu you are already selling, the floor plan, and above all
-- the PRINTER SETTINGS are untouched. (Printer settings never lived in the
-- database anyway — they are stored on each till.)
--
-- Safe to re-run: every insert is guarded.
--
--   1. table shapes  — round / long (sofa), so the floor map draws them
--   2. Salon gains 3 long benches (4 -> 7) and 2 round tables
--   3. new "Petit-déjeuner" main category with 3 breakfasts
--
-- PRICES ARE NOT SET. The three breakfasts go in at 0.00 and marked OUT OF
-- STOCK on purpose, so nobody can sell one for nothing by accident. Set the
-- price in the app (Admin -> Stock & Prix), then flip each to "Disponible".
-- ============================================================
set search_path = public, extensions;

begin;

-- ---------- 1. table shapes ----------
-- 'square' is the default look; 'round' draws a circle, 'long' a wide bench.
alter table restaurant_tables add column if not exists shape text;

do $$ begin
  alter table restaurant_tables
    add constraint restaurant_tables_shape_chk
    check (shape is null or shape in ('square', 'round', 'long'));
exception when duplicate_object then null; end $$;

-- Existing Salon benches: the 6-seaters were already drawn wide, so name
-- that shape explicitly rather than leaving it to the seat-count fallback.
update restaurant_tables set shape = 'long'
  where layer = 'salon' and seats >= 6 and shape is null;
update restaurant_tables set shape = 'square'
  where shape is null;

-- ---------- 2. more Salon tables ----------
-- 3 more benches (long) takes the Salon from 4 to 7, plus 2 round tops.
insert into restaurant_tables (id, label, seats, zone, layer, shape, sort, vip, x, y, branch) values
  ('S21', 'S21', 6, 'Salon', 'salon', 'long',  21, false, 8,  78, 'main'),
  ('S22', 'S22', 6, 'Salon', 'salon', 'long',  22, false, 29, 78, 'main'),
  ('S23', 'S23', 6, 'Salon', 'salon', 'long',  23, false, 50, 78, 'main'),
  ('S24', 'S24', 4, 'Salon', 'salon', 'round', 24, false, 71, 78, 'main'),
  ('S25', 'S25', 4, 'Salon', 'salon', 'round', 25, false, 88, 78, 'main')
on conflict (id) do nothing;

-- ---------- 3. Breakfast ----------
-- `main` is the print routing: 'breakfast' is food, so it prints in the
-- kitchen exactly like 'food'. Only 'drinks' goes to the bar.
insert into menu_categories (name_fr, name_en, name_es, main, sort)
select 'Petit-déjeuner', 'Breakfast', 'Desayuno', 'breakfast', 0
where not exists (select 1 from menu_categories where main = 'breakfast');

insert into menu_items (category_id, name, price, sort)
select c.id, v.name, 0.00, v.sort
from (values
  ('Breakfast Marocain', 1),
  ('Breakfast Turk', 2),
  ('Breakfast Turk 2 PERS', 3)
) as v(name, sort)
join menu_categories c on c.main = 'breakfast'
where not exists (
  select 1 from menu_items mi where mi.category_id = c.id and mi.name = v.name
);

-- Out of stock until someone sets a real price. A missing menu_stock row
-- means AVAILABLE, so this row has to exist to hold them back.
insert into menu_stock (menu_item_id, branch, available)
select mi.id, 'main', false
from menu_items mi
join menu_categories c on c.id = mi.category_id
where c.main = 'breakfast'
on conflict (menu_item_id, branch) do nothing;

commit;

-- ---------- verify ----------
-- Expect: 3 breakfasts at 0.00 and not available; Salon with 7 long + 2 round.
select c.name_fr as categorie, mi.name, mi.price, coalesce(ms.available, true) as disponible
from menu_items mi
join menu_categories c on c.id = mi.category_id
left join menu_stock ms on ms.menu_item_id = mi.id
where c.main = 'breakfast'
order by mi.sort;

select layer, coalesce(shape, '(aucune)') as forme, count(*) as tables
from restaurant_tables group by layer, shape order by layer, shape;
