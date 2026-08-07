-- ============================================================
-- Acua — NEW BAR MENU. Run ONCE in the Acua project's SQL Editor.
-- ============================================================
-- Replaces the ENTIRE bar (drinks) side with the new café menu, and adds the
-- new "Signature Sandwiches" (kitchen/food) category.
--
--   * Every category with main='drinks' is deleted and rebuilt. Items and
--     per-item stock rows cascade-delete automatically. Closed orders keep
--     their own snapshot of name/price, so history is NOT affected.
--   * The kitchen/food side (Burgers, Pastas, Grilled, Salads, Starters,
--     Sides, and the existing "Sandwichs Classiques") is LEFT UNTOUCHED,
--     except that "Signature Sandwiches" is added alongside it.
--   * Routing unchanged: 'drinks' prints at the BAR, 'food' in the KITCHEN.
--   * Website-only bits (kcal badges, "NEW" pills, photos, "100% NATURAL"
--     callouts) have no POS field — kcal + NEW are folded into the item
--     description; coffee milk/syrup extras are added as their own +€ items.
--
-- Safe to re-run: it deletes-then-reinserts the same categories.
-- ============================================================

begin;

-- 1) Wipe the whole bar (drinks) menu (items + stock cascade away).
delete from menu_categories where main = 'drinks';

-- 2) Rebuild the drinks categories (trilingual FR / EN / ES).
insert into menu_categories (name_fr, name_en, name_es, main, sort) values
  ('Cafés',                'Coffee',              'Cafés',                      'drinks',  9),
  ('Matcha',               'Matcha',              'Matcha',                     'drinks', 10),
  ('Jus Pressés à Froid',  'Cold Pressed Juices', 'Zumos Prensados en Frío',    'drinks', 11),
  ('Shakes Protéinés',     'Protein Shakes',      'Batidos de Proteínas',       'drinks', 12),
  ('Shots Bien-être',      'Wellness Shots',      'Shots de Bienestar',         'drinks', 13);

-- 3) Drinks items.
insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.descr, v.price, v.sort
from (values
  -- Coffee (+ milk/syrup extras as their own lines)
  ('Cafés', 'Iced Latte',              '',                               4.00, 1),
  ('Cafés', 'Iced Americano',          '',                               3.50, 2),
  ('Cafés', 'Flat White',              '',                               4.00, 3),
  ('Cafés', 'Cappuccino',              '',                               4.00, 4),
  ('Cafés', '+ Oat Milk',              'Supplément / Extra',             0.50, 5),
  ('Cafés', '+ Almond Milk',           'Supplément / Extra',             0.50, 6),
  ('Cafés', '+ Vanilla Syrup',         'Supplément / Extra',             0.50, 7),
  ('Cafés', '+ Sugar-Free Vanilla',    'Supplément / Extra',             0.50, 8),
  ('Cafés', '+ Extra Espresso Shot',   'Supplément / Extra',             1.00, 9),
  -- Matcha (100% natural)
  ('Matcha', 'Iced Vanilla Matcha',    'Ceremonial matcha, vanilla & milk',        8.00, 1),
  ('Matcha', 'Iced Pistachio Matcha',  'Matcha, pistachio cream & milk',           8.50, 2),
  ('Matcha', 'Classic Iced Matcha',    'Matcha & milk',                            7.50, 3),
  ('Matcha', 'Iced Mango Matcha',      'NEW · Matcha, mango puree & milk',         8.50, 4),
  ('Matcha', 'Iced Strawberry Matcha', 'NEW · Matcha, strawberry puree & milk',    8.50, 5),
  -- Cold Pressed Juices (fresh apple base)
  ('Jus Pressés à Froid', 'Green Detox',    'Apple, spinach, cucumber, celery & lemon', 8.00, 1),
  ('Jus Pressés à Froid', 'Skin Glow',      'Apple, carrot, orange, ginger & turmeric', 8.50, 2),
  ('Jus Pressés à Froid', 'Pink Energy',    'Apple, strawberry, raspberry',             8.50, 3),
  ('Jus Pressés à Froid', 'Tropical Boost', 'Apple, pineapple & mint',                  8.00, 4),
  -- Protein Shakes (vanilla whey + frozen fruit)
  ('Shakes Protéinés', 'Pineapple Protein', 'Vanilla whey, pineapple & almond milk',    8.50, 1),
  ('Shakes Protéinés', 'Berry Protein',     'Vanilla whey, mixed berries & almond milk', 8.50, 2),
  ('Shakes Protéinés', 'Banana Boost',      'Vanilla whey, banana, cinnamon & almond milk', 8.50, 3),
  -- Wellness Shots
  ('Shots Bien-être', 'Ginger Shot',   'Ginger, lemon & apple',            3.50, 1),
  ('Shots Bien-être', 'Immunity Shot', 'Ginger, turmeric, honey & lemon',  4.00, 2),
  ('Shots Bien-être', 'Energy Shot',   'Ginger, orange & cayenne',         4.00, 3)
) as v(cat_fr, name, descr, price, sort)
join menu_categories c on c.name_fr = v.cat_fr;

-- 4) Signature Sandwiches (KITCHEN / food) — added alongside existing food.
--    Served on artisan bread with fresh avocado.
delete from menu_categories where name_fr = 'Sandwichs Signature';
insert into menu_categories (name_fr, name_en, name_es, main, sort) values
  ('Sandwichs Signature', 'Signature Sandwiches', 'Bocadillos Signature', 'food', 0);

insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.descr, v.price, v.sort
from (values
  ('Sandwichs Signature', 'Chicken Pesto', 'Grilled chicken, pesto, mozzarella, tomato & avocado · 620 kcal', 9.50, 1),
  ('Sandwichs Signature', 'Turkey Fresh',  'Turkey breast, pesto, cucumber & avocado · 560 kcal',            9.00, 2),
  ('Sandwichs Signature', 'Spicy Tuna',    'Tuna mousse, jalapeños, Tabasco & avocado · 590 kcal',           9.50, 3),
  ('Sandwichs Signature', 'Veggie',        'Mozzarella, tomato, rocket, pesto & avocado · 540 kcal',         8.50, 4),
  ('Sandwichs Signature', 'Egg Mousse (Bagel)', 'Egg mousse & tomato on a toasted bagel',         8.50, 5)
) as v(cat_fr, name, descr, price, sort)
join menu_categories c on c.name_fr = v.cat_fr;

-- 5) Healthy Bowls (KITCHEN / food) — new category. Bowls don't prompt for an
--    included drink (their category isn't a drink-included one).
delete from menu_categories where name_fr = 'Bowls Healthy';
insert into menu_categories (name_fr, name_en, name_es, main, sort) values
  ('Bowls Healthy', 'Healthy Bowls', 'Bowls Saludables', 'food', 0);

insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.descr, v.price, v.sort
from (values
  ('Bowls Healthy', 'Classic Bowl', '', 9.50, 1),
  ('Bowls Healthy', 'Berry Bowl',   '', 9.50, 2)
) as v(cat_fr, name, descr, price, sort)
join menu_categories c on c.name_fr = v.cat_fr;

commit;

-- Sanity check — item counts per category (run after commit if you like):
-- select c.name_en, count(i.id) from menu_categories c
--   left join menu_items i on i.category_id = c.id
--   group by c.name_en, c.sort order by c.sort;
