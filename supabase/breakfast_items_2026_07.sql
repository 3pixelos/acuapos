-- ============================================================
-- Beymen POS — breakfast items (À La Carte, Formulas, Turkish Breakfast).
-- Run once in the Supabase SQL Editor, after reseed_categories_2026_07.sql.
-- ============================================================
set search_path = public, extensions;

-- ============================================
-- À LA CARTE ITEMS
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  -- Omelettes
  ('Omelette nature', '', 28, 1),
  ('Omelette au fromage', '', 34, 2),
  ('Omelette à la dinde fumée et au fromage', '', 38, 3),
  ('Omelette aux légumes', '', 40, 4),
  ('Omelette aux champignons et au fromage', '', 40, 5),
  -- Beldi
  ('Baghrir', 'Amlou, miel, banane, fruits secs', 10, 6),
  ('Harcha', '', 15, 7),
  ('Msemen', '', 28, 8),
  -- Viennoiseries
  ('Pain au chocolat', '', 10, 9),
  ('Croissant simple', '', 10, 10),
  -- Tajines
  ('Tajine khlii (2 œufs)', '', 42, 11),
  ('Tajine khlii (3 œufs)', '', 55, 12),
  -- Tava
  ('Tava normal', '', 34, 13),
  ('Saucisse turque à l''ail "Sucuk" avec œuf', '', 69, 14),
  -- Croissants (avec œuf)
  ('Croissant à la dinde fumée et au fromage', 'Avec œuf', 39, 15),
  ('Croissant au pastrami de bœuf et au fromage', '', 49, 16),
  -- Toast
  ('Toast au fromage', '', 20, 17),
  ('Toast à la dinde fumée et au fromage', '', 28, 18),
  -- Croque
  ('Croque au fromage', '', 35, 19),
  ('Croque madame', '', 45, 20),
  -- Pain Perdu
  ('Pain perdu au Nutella-caramel et glace vanille', '', 42, 21),
  -- Pancakes
  ('4 Pancakes', 'Nutella ou miel', 35, 22),
  -- Simit
  ('Simit turc au sucuk', '', 89, 23)
) AS v(name, description, price, sort)
WHERE menu_categories.name_fr = 'À La Carte' AND menu_categories.main = 'breakfast';

-- ============================================
-- FORMULAS ITEMS  (name_fr = 'Formules', name_en = 'Formulas')
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Gourmand', 'Boisson chaude (thé ou expresso ou café crème), Eau minérale, Jus d''orange ou jus de carotte, Un viennoiserie au choix, Oeuf (au plat ou brouillé ou omelette) (nature ou au fromage ou aux champignons), Panier de pain, Beurre, Confiture, Olives, Yaourt et granola.', 99, 1),
  ('Espagnol', 'Boisson chaude (thé ou expresso ou café crème), Eau minérale, Jus d''orange ou jus de carotte, Pain complet grillé ou toast grillé, Tomates, Olive, Pesto, Fromage manchego, Confiture, Olives, Yaourt et granola.', 69, 2),
  ('Marocain', 'Boisson chaude (thé ou expresso ou café crème), Eau minérale, Panier de pain, Beurre, Miel, Amlou, Fromage blanc, Confiture, Olives, 2 oeufs au khlii, Msemen, Harcha, Baghrir, Yaourt et granola.', 98, 3),
  ('Tangérois', 'Boisson chaude (thé ou expresso ou café crème), Eau minérale, 2 oeuf au plat, pain, Huile d''olives, Olives et Jben beldi.', 55, 4),
  ('Junior', 'Chocolat chaud, bol de corn flakes avec yaourt, salade de fruits et deux pancakes au Nutella.', 55, 5),
  ('Express', 'Boisson chaude (thé ou expresso ou café crème), Eau minérale, Jus d''orange ou jus de carotte, Une viennoiserie au choix, Pain, Toast, Beurre et confiture.', 55, 6),
  ('Eggs Benedict', 'Boisson chaude (thé ou expresso ou café crème), Eau minérale, Jus d''orange ou jus de carotte, Pain grillé noir ou pain burger, Saumon fumé et guacamole, 2 œufs pochés et sauce hollandaise.', 109, 7),
  ('Continental', 'Boisson chaude (thé ou expresso ou café crème), Une viennoiserie au choix, Toast au fromage, Dinde fumée, Yaourt, Granola, Jus d''orange ou jus de carotte et eau minérale.', 69, 8),
  ('Healthy', 'Boisson chaude (thé ou expresso ou café crème), Eau minérale, Jus d''orange, Jus détox, Salade fitness (saumon fumé, concombre, tomates cerises et mangue), Toast à l''avocat, Oeuf poché sur toast, Boule d''énergie et salade de fruits.', 95, 9),
  ('Anglais', 'Boisson chaude (thé ou expresso ou café crème), Eau minérale, Jus d''orange ou jus de carotte, deux œufs (au plat ou brouillés), Saucisses de bœuf, Pastrami, Haricots blancs à la sauce tomate, Champignons poêlés, Tomates grillées et panier de pain.', 115, 10),
  ('Brunch', 'Boisson chaude (thé ou expresso ou café crème), Eau minérale, Jus d''orange ou jus de carotte, Deux viennoiseries au choix, Dinde fumée, Fromage Edam, Salami, Saucisses de bœuf, Yaourt, Granola, Panier de pain, Beurre, Confiture, Fromage blanc, Olives, Oeufs au choix (nature ou au plat), fromage et champignons.', 149, 11),
  ('Healthy bowls', 'Granola maison aux céréales et fruits secs, acai fruit, yaourt et fruits de saison.', 80, 12)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Formulas' AND menu_categories.main = 'breakfast';

-- ============================================
-- TURKISH BREAKFAST ITEMS  (name_fr = 'Petit-déjeuner Turc', name_en = 'Turkish Breakfast')
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Beymen Kahvalti (1P)', 'Assortiment de fromages, Olives marinées aux herbes, Salade de crudités, Jambon de dinde, Salami, Fruits secs, Confiture de fraise et d''abricot, Miel, Beurre, Nutella, Tahini, Mélasse de raisin, Oeuf au plat, Pomme de terre au four, Pain Simit, Brioche au chocolat, Salade de fruits, Jus d''orange, Eau minérale, Thé turc, Café crème et thé marocain.', 110, 1),
  ('Beymen Kahvalti (2P)', 'Assortiment de fromages, Olives marinées aux herbes, Salade de crudités, Jambon de dinde, Salami, Fruits secs, Confiture de fraise et d''abricot, Miel, Beurre, Nutella, Tahini, Mélasse de raisin, 2 œufs au plat, Menemen, Pomme de terre au four, Pain Simit, Brioche au chocolat, Salade de fruits, 2 jus d''orange, Eau minérale, Thé turc, Café crème et thé marocain.', 199, 2),
  ('Turkish Eggs', 'Greek yogurt, Garlic, Eggs, olive oil, Aleppo pepper', 80, 3)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Turkish Breakfast' AND menu_categories.main = 'breakfast';
