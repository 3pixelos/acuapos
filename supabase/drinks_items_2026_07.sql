-- ============================================================
-- Beymen POS — drinks items, all 9 subcategories.
-- Run once in the Supabase SQL Editor, after reseed_categories_2026_07.sql.
--
-- Notes on prices that weren't cleanly readable in the source photos
-- (confirmed with the user, or resolved by matching item-count to
-- visible-price-count where the menu's layout offset the price column):
--   * Miami smoothie: cut off in the photo -> 69 (confirmed, same tier as
--     Ginger/Happy Heart).
--   * Avocado Juice: covered by a price-correction sticker -> 59 (confirmed).
--   * Avocado Juice with Dried Fruits: same sticker -> 89 (confirmed).
--   * Mango Juice: not visible in the photo at all -> 59 (confirmed).
--   * Coffee Lovers: Espresso's price cell was under a sticker showing
--     "22"; Americano's price wasn't legible either. Resolved by matching
--     18 remaining item names to 18 remaining visible numbers, which lines
--     up perfectly if Americano = 24DH (the first uncovered number) and
--     every item after it takes the next number in sequence. Not
--     independently confirmed — flag if Americano's real price differs.
-- ============================================================
set search_path = public, extensions;

-- ============================================
-- SMOOTHIES
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Rose Paradis', 'Fraise, banane, orange', 59, 1),
  ('Mango', 'Mangue, yaourt, banane, fruits de la passion, orange', 59, 2),
  ('Pink Panther', 'Fruits rouges, glace à la vanille, banane, jus de pomme pressée', 59, 3),
  ('Strawberry', 'Fraise, banane, pomme, orange', 59, 4),
  ('Ginger', 'Gingembre, pomme, mangue, orange', 69, 5),
  ('Happy Heart', 'Ananas, fraise, pomme, banane, orange', 69, 6),
  ('Miami', 'Pêche, ananas, mangue, fruits de la passion, menthe', 69, 7)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Smoothies' AND menu_categories.main = 'drinks';

-- ============================================
-- PRESSED JUICES
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Ananas Pressé', '', 89, 1),
  ('Pomme Pressée', '', 79, 2),
  ('Pastèque Pressée', '', 79, 3),
  ('Mix Pressé', '', 89, 4)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Pressed Juices' AND menu_categories.main = 'drinks';

-- ============================================
-- NATURAL JUICES
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Jus d''Orange', '', 35, 1),
  ('Jus de Citron', '', 35, 2),
  ('Jus de Carotte', '', 35, 3),
  ('Jus de Banane', '', 35, 4),
  ('Jus de Pomme', '', 35, 5),
  ('Jus de Fraise', '', 40, 6),
  ('Jus de Fraise-Banane', '', 45, 7),
  ('Jus de Kiwi', '', 45, 8),
  ('Jus de Fruits Rouges', '', 50, 9),
  ('Jus d''Avocat', '', 59, 10),
  ('Jus d''Avocat aux Fruits Secs', '', 89, 11),
  ('Jus de Fruits de Saison', '', 55, 12),
  ('Jus d''Ananas', '', 55, 13),
  ('Jus de Mangue', '', 59, 14)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Natural Juices' AND menu_categories.main = 'drinks';

-- ============================================
-- MOCKTAILS
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Green Life', 'Citron, fruits de la passion, ananas, curaçao bleu, pina, orange', 55, 1),
  ('Blue Life', 'Coco, curaçao bleu, citron, sprite', 69, 2),
  ('Bora Bora', 'Sirop de grenadine, jus d''orange, fruits de la passion, sprite, Curaçao bleu', 69, 3),
  ('Sunrise', 'Sirop de grenadine, jus d''orange, Pure pêche', 69, 4),
  ('Tropical Blue', 'Pina, pure coco, pure ananas, curaçao bleu, sprite', 69, 5),
  ('Virgin Colada', 'Ananas, pure coco, lait de coco, jus d''ananas', 69, 6),
  ('Kiwi King', 'Kiwi, citron, orange, menthe, sirop de sucre de canne, sprite', 69, 7),
  ('Beymen Mocktail', 'Jus d''ananas, jus d''orange, fruit de la passion, soda, curaçao bleu, sirop de grenadine', 89, 8),
  ('Sangria', 'Fruits rouges, jus d''orange, mix de fruits, cannelle, citron', 79, 9),
  ('Citronade', 'Miel, citron, menthe', 45, 10),
  ('Detox', 'Citron, orange, carotte, gingembre, jus de pomme pressée', 59, 11),
  ('Cindrella', 'Jus d''orange, jus d''ananas, pure fraise', 55, 12),
  ('Pink Coco', 'Ananas, pure coco, fraise, lait de coco', 69, 13),
  ('Iran', 'Yaourt nature, oulmès, sel', 29, 14),
  ('Blue Lagoon', 'Jus d''ananas, sprite, sirop de monin', 79, 15)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Mocktails' AND menu_categories.main = 'drinks';

-- ============================================
-- MOJITOS
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Virgin Mojito Classic', '', 69, 1),
  ('Virgin Mojito Strawberry', '', 79, 2),
  ('Virgin Mojito Blueberry', '', 79, 3),
  ('Mojito Redbull', '', 89, 4)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Mojitos' AND menu_categories.main = 'drinks';

-- ============================================
-- MILK SHAKES
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Chocolat', '', 45, 1),
  ('Vanille', '', 45, 2),
  ('Noisette', '', 45, 3),
  ('Fraise', '', 40, 4),
  ('Chocolat Oreo', '', 59, 5),
  ('Pistache', '', 69, 6)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Milk Shakes' AND menu_categories.main = 'drinks';

-- ============================================
-- SODAS
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Boissons Gazeuses', '', 28, 1),
  ('Red Bull', '', 45, 2),
  ('Energy', '', 30, 3),
  ('Power Horse', '', 39, 4),
  ('Oulmès (33cl)', '', 18, 5),
  ('Oulmès (75cl)', '', 25, 6)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Sodas' AND menu_categories.main = 'drinks';

-- ============================================
-- TEA LOVERS
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Thé Tangérois', '', 22, 1),
  ('Thé Noir', '', 22, 2),
  ('Thé Turc', '', 15, 3),
  ('Thé à la Camomille', '', 28, 4),
  ('Thé au Jasmin', '', 30, 5),
  ('Thé aux Fruits Rouges', '', 32, 6),
  ('Thé Glacé', '', 35, 7)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Tea Lovers' AND menu_categories.main = 'drinks';

-- ============================================
-- COFFEE LOVERS
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Café Espresso', '', 22, 1),
  ('Café Américain', '', 24, 2),
  ('Café Espresso Double', '', 28, 3),
  ('Lait Chaud / Froid', '', 18, 4),
  ('Café Latte Classique', '', 32, 5),
  ('Latte Viennois', '', 38, 6),
  ('Cappuccino Italien', '', 32, 7),
  ('Cappuccino Viennois', '', 38, 8),
  ('Café Glacé', '', 39, 9),
  ('Chocolat Chaud', '', 30, 10),
  ('Chocolat Fondu', '', 40, 11),
  ('Dolce Espresso Caramelo', '', 30, 12),
  ('Dolce Espresso Nutellino', '', 34, 13),
  ('Dolce Espresso Chocolat & Noisette', '', 32, 14),
  ('Dolce Latte Caramelo / Chocolat & Noisette', '', 45, 15),
  ('Dolce Latte Nutellino', '', 49, 16),
  ('Café Turc', '', 25, 17),
  ('Frappuccino Chocolat', '', 39, 18),
  ('Frappuccino Noisette / Caramel / Vanille', '', 42, 19)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Coffee Lovers' AND menu_categories.main = 'drinks';
