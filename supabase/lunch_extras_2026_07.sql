-- ============================================================
-- Beymen POS — Extras subcategory under main "Lunch". Run once in
-- Supabase SQL Editor. Safe to re-run (items are rebuilt from scratch).
-- ============================================================
set search_path = public, extensions;

-- category: create it if it doesn't exist yet, otherwise just make sure
-- it's filed under 'lunch' with the right name.
insert into menu_categories (name_fr, name_en, main, sort)
select 'Extras', 'Extras', 'lunch', 15
where not exists (select 1 from menu_categories where name_fr = 'Extras' and main = 'lunch');

update menu_categories set main = 'lunch', name_en = 'Extras'
where name_fr = 'Extras' and main <> 'lunch';

-- wipe + rebuild its items
delete from menu_items
where category_id in (select id from menu_categories where name_fr = 'Extras' and main = 'lunch');

insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, '', v.price, v.sort
from menu_categories c,
(values
  ('Extra Sirop',              6,  1),
  ('Extra Pastrami',           30, 2),
  ('Extra Avocat Guacamole',   20, 3),
  ('Granola Offert',           0,  4),
  ('Extra Riz',                15, 5),
  ('Extra Frite',              20, 6),
  ('Extra Charcutrie',         10, 7),
  ('Extra Smith',              10, 8),
  ('Extra Sojouk',             20, 9),
  ('Extra Brioche',            10, 10),
  ('Extra Crevette',           59, 11),
  ('Extra Tortilla',           10, 12),
  ('Extra V.Hachée',           45, 13),
  ('Extra Sauce Champignons',  10, 14),
  ('Extra Pomme Four',         20, 15),
  ('Extra Fromage',            15, 16),
  ('Extra Poulet Pané',        45, 17),
  ('Extra Légumes Sautés',     25, 18),
  ('Extra Borghol',            15, 19)
) as v(name, price, sort)
where c.name_fr = 'Extras' and c.main = 'lunch';
