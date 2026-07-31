-- ============================================================
-- Beymen POS — main categories + subcategories. Run once in Supabase SQL
-- Editor (after fixes_2026_07b.sql).
--
-- Five main categories (Breakfast, Lunch, Steaks, Sweets, Drinks) held in
-- a new menu_categories.main column; every existing category becomes a
-- subcategory of one of them. Also:
--   * 'Extras Sweet' renamed 'Extras Breakfast'
--   * 'Jus & Smoothies' split into Smoothies / Pressed Juices / Natural
--     Juices, and 'Mojitos, Milkshakes & Sodas' into Mojitos / Milk
--     Shakes / Sodas — items are moved by their original sort ranges from
--     menu_real.sql, so run this before hand-editing those categories.
-- ============================================================
set search_path = public, extensions;

alter table menu_categories add column if not exists main text not null default '';

-- ---------- split the two combined drinks categories ----------
-- 'Jus & Smoothies' keeps its id and becomes 'Smoothies' (items sort 1-7).
insert into menu_categories (name_fr, name_en, main, sort)
select 'Jus Pressés', 'Pressed Juices', 'drinks', 24
where not exists (select 1 from menu_categories where name_en = 'Pressed Juices');
insert into menu_categories (name_fr, name_en, main, sort)
select 'Jus Naturels', 'Natural Juices', 'drinks', 25
where not exists (select 1 from menu_categories where name_en = 'Natural Juices');

update menu_items set category_id = (select id from menu_categories where name_en = 'Pressed Juices')
where category_id = (select id from menu_categories where name_fr = 'Jus & Smoothies')
  and sort between 8 and 11;
update menu_items set category_id = (select id from menu_categories where name_en = 'Natural Juices')
where category_id = (select id from menu_categories where name_fr = 'Jus & Smoothies')
  and sort between 12 and 25;

-- 'Mojitos, Milkshakes & Sodas' keeps its id and becomes 'Mojitos' (1-4).
insert into menu_categories (name_fr, name_en, main, sort)
select 'Milkshakes', 'Milk Shakes', 'drinks', 28
where not exists (select 1 from menu_categories where name_en = 'Milk Shakes');
insert into menu_categories (name_fr, name_en, main, sort)
select 'Sodas', 'Sodas', 'drinks', 29
where not exists (select 1 from menu_categories where name_en = 'Sodas');

update menu_items set category_id = (select id from menu_categories where name_en = 'Milk Shakes')
where category_id = (select id from menu_categories where name_fr = 'Mojitos, Milkshakes & Sodas')
  and sort between 5 and 10;
update menu_items set category_id = (select id from menu_categories where name_fr = 'Sodas' and name_en = 'Sodas')
where category_id = (select id from menu_categories where name_fr = 'Mojitos, Milkshakes & Sodas')
  and sort between 11 and 16;

-- ---------- rename + assign every subcategory to its main ----------
update menu_categories set name_fr = v.fr, name_en = v.en, main = v.m, sort = v.s
from (values
  -- breakfast
  ('Formules Petit-déjeuner',      'Formules',           'Formulas',           'breakfast', 1),
  ('Petit-déjeuner Cuisiné',       'Petit-déjeuner Turc','Turkish Breakfast',  'breakfast', 2),
  ('Petit-déjeuner à la carte',    'À La Carte',         'À La Carte',         'breakfast', 3),
  ('Extras Sweet',                 'Extras Breakfast',   'Extras Breakfast',   'breakfast', 4),
  -- lunch
  ('Soupes',                       'Soupes Turques',     'Turkish Soups',      'lunch', 5),
  ('Salades',                      'Salades Fraîches',   'Fresh Salads',       'lunch', 6),
  ('Entrées Froides',              'Entrées Froides',    'Cold Appetizers',    'lunch', 7),
  ('Entrées Chaudes',              'Entrées Chaudes',    'Hot Appetizers',     'lunch', 8),
  ('Plats Mijotés',                'Plats Classiques',   'Classic Dishes',     'lunch', 9),
  ('Pide',                         'Pide',               'Turkish Pizza',      'lunch', 10),
  ('Poissons',                     'Poissons',           'Fish Dishes',        'lunch', 11),
  ('Fast Food',                    'Fast Food',          'Fast Food',          'lunch', 12),
  ('Grillades',                    'Grillades',          'Grill',              'lunch', 13),
  ('Durum',                        'Durum',              'Turkish Wrap',       'lunch', 14),
  ('Extras',                       'Extras',             'Extras',             'lunch', 15),
  -- steaks
  ('Entrées Steakhouse',           'Entrées',            'Starters',           'steaks', 16),
  ('Burgers Steakhouse',           'Burgers',            'Burgers',            'steaks', 17),
  ('Rôtis',                        'Rôtis',              'Roasts',             'steaks', 18),
  ('Steaks',                       'Steaks',             'Steaks',             'steaks', 19),
  ('Golden Steaks',                'Golden Steaks',      'Golden Steaks',      'steaks', 20),
  -- sweets
  ('Sucreries Traditionnelles',    'Sucreries Traditionnelles', 'Traditional Sweets', 'sweets', 21),
  ('Sucreries Gourmandes',         'Sucreries Gourmandes',      'Delicious Sweets',   'sweets', 22),
  -- drinks
  ('Jus & Smoothies',              'Smoothies',          'Smoothies',          'drinks', 23),
  ('Mocktails',                    'Mocktails',          'Mocktails',          'drinks', 26),
  ('Mojitos, Milkshakes & Sodas',  'Mojitos',            'Mojitos',            'drinks', 27),
  ('Thés',                         'Tea Lovers',         'Tea Lovers',         'drinks', 30),
  ('Cafés',                        'Coffee Lovers',      'Coffee Lovers',      'drinks', 31)
) as v(old_fr, fr, en, m, s)
where name_fr = v.old_fr;
