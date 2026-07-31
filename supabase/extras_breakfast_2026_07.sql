-- ============================================================
-- Beymen POS — Extras Breakfast items.
-- Run once in the Supabase SQL Editor, after reseed_categories_2026_07.sql.
-- ============================================================
set search_path = public, extensions;

INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Confiture', '', 6, 1),
  ('Amlou', '', 12, 2),
  ('Miel', '', 8, 3),
  ('Nutella', '', 12, 4),
  ('Jben Beldi', '', 12, 5),
  ('Fromage Edam', '', 14, 6),
  ('Dinde Fumée', '', 16, 7),
  ('Pastrami Bœuf', '', 25, 8),
  ('Avocat Guacamole', '', 20, 9),
  ('Thon', '', 25, 10),
  ('Saumon Fumé', '', 45, 11),
  ('Extra Beurre', '', 8, 12)
) AS v(name, description, price, sort)
WHERE menu_categories.name_fr = 'Extras Breakfast' AND menu_categories.main = 'breakfast';
