-- ============================================================
-- Beymen POS — sweets items (Traditional Sweets, Delicious Sweets).
-- Run once in the Supabase SQL Editor, after reseed_categories_2026_07.sql.
-- ============================================================
set search_path = public, extensions;

-- ============================================
-- TRADITIONAL SWEETS
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Kunefe', 'Kunefe au fromage et glace à la vanille', 69, 1),
  ('Havuc Dilimi', 'Baklava servi avec de la glace vanille', 65, 2),
  ('Sutlac', 'Riz au lait à la turque', 45, 3),
  ('Baklava', 'Pâtisserie feuilletée à la pistache et au miel', 55, 4),
  ('Kazandibi', 'Pudding au lait caramélisé à la glace vanille et cannelle', 45, 5)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Traditional Sweets' AND menu_categories.main = 'sweets';

-- ============================================
-- DELICIOUS SWEETS
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Beymen Tatli (2P)', 'Un plateau de fruits de saison variés servi avec de la glace et de la crème fraîche', 225, 1),
  ('Beymen Tatli (4P avec show)', 'Un plateau de fruits de saison variés servi avec de la glace et de la crème fraîche, 2 pièces gâteau, Havuc dilimi, Sutlac', 389, 2),
  ('Tiramisu', '', 69, 3),
  ('San Sebastian', '', 69, 4),
  ('Trilece', '', 59, 5),
  ('Red Velvet Cheesecake', '', 69, 6),
  ('Cheesecake', '', 59, 7),
  ('Fondant au Chocolat', '', 79, 8),
  ('Choco Berry', 'Pancake moelleux x2, fruits rouges, pépites de chocolat, mascarpone, noisette', 75, 9),
  ('Caramel Pancake', 'Pancake moelleux x2, caramel, glace vanille, amandes, cassonade', 75, 10),
  ('Crêpe ou Gaufre', 'Nature ou au sucre', 22, 11),
  ('Crêpe ou Gaufre Nutella', 'Sauce Nutella', 32, 12),
  ('Crêpe Pistachio Kunafa', 'Pistache et Kunafa', 65, 13),
  ('Kids Menu Pancake', 'Pancake moelleux x1, Nutella', 49, 14)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Delicious Sweets' AND menu_categories.main = 'sweets';
