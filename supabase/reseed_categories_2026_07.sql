-- ============================================================
-- Beymen POS — recreate all menu categories after the accidental wipe.
-- Run once in the Supabase SQL Editor. Safe to re-run (clears and reseeds).
--
-- The five MAIN categories (breakfast, lunch, steaks, sweets, drinks) are
-- not rows — they live in the `main` column of each subcategory; the app's
-- level-1 screen derives them from there. Items are added later by hand.
-- ============================================================
set search_path = public, extensions;

delete from menu_categories;

insert into menu_categories (name_fr, name_en, main, sort) values
  -- breakfast
  ('Formules',                  'Formulas',            'breakfast', 1),
  ('Petit-déjeuner Turc',       'Turkish Breakfast',   'breakfast', 2),
  ('À La Carte',                'À La Carte',          'breakfast', 3),
  ('Extras Breakfast',          'Extras Breakfast',    'breakfast', 4),
  -- lunch
  ('Soupes Turques',            'Turkish Soups',       'lunch', 5),
  ('Salades Fraîches',          'Fresh Salads',        'lunch', 6),
  ('Entrées Froides',           'Cold Appetizers',     'lunch', 7),
  ('Entrées Chaudes',           'Hot Appetizers',      'lunch', 8),
  ('Plats Classiques',          'Classic Dishes',      'lunch', 9),
  ('Pide',                      'Turkish Pizza',       'lunch', 10),
  ('Poissons',                  'Fish Dishes',         'lunch', 11),
  ('Fast Food',                 'Fast Food',           'lunch', 12),
  ('Grillades',                 'Grill',               'lunch', 13),
  ('Durum',                     'Turkish Wrap',        'lunch', 14),
  ('Extras',                    'Extras',              'lunch', 15),
  -- steaks
  ('Entrées',                   'Starters',            'steaks', 16),
  ('Burgers',                   'Burgers',             'steaks', 17),
  ('Rôtis',                     'Roasts',              'steaks', 18),
  ('Steaks',                    'Steaks',              'steaks', 19),
  ('Golden Steaks',             'Golden Steaks',       'steaks', 20),
  -- sweets
  ('Sucreries Traditionnelles', 'Traditional Sweets',  'sweets', 21),
  ('Sucreries Gourmandes',      'Delicious Sweets',    'sweets', 22),
  -- drinks
  ('Smoothies',                 'Smoothies',           'drinks', 23),
  ('Jus Pressés',               'Pressed Juices',      'drinks', 24),
  ('Jus Naturels',              'Natural Juices',      'drinks', 25),
  ('Mocktails',                 'Mocktails',           'drinks', 26),
  ('Mojitos',                   'Mojitos',             'drinks', 27),
  ('Milkshakes',                'Milk Shakes',         'drinks', 28),
  ('Sodas',                     'Sodas',               'drinks', 29),
  ('Tea Lovers',                'Tea Lovers',          'drinks', 30),
  ('Coffee Lovers',             'Coffee Lovers',       'drinks', 31);
