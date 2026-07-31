-- ============================================================
-- Beymen POS — lunch items (all 10 subcategories).
-- Run once in the Supabase SQL Editor, after reseed_categories_2026_07.sql.
-- ============================================================
set search_path = public, extensions;

-- ============================================
-- TURKISH SOUPS
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Mercimek Çorbası', 'Soupe aux lentilles', 45, 1),
  ('Tavuk Çorba', 'Soupe au poulet', 55, 2)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Turkish Soups' AND menu_categories.main = 'lunch';

-- ============================================
-- FRESH SALADS
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Kasik Salata', 'Tomates, oignons, poivrons, persil, concombres, huile d''olive, sauce de grenadine', 59, 1),
  ('Roka Salata', 'Salade de roquette, parmesan, tomates cerises, pignons de pin', 65, 2),
  ('Avocado Salata', 'Avocat, tomates cerises, concombres, laitue, roquette, huile d''olive, jus de citron', 89, 3),
  ('Tavuku Sezar Salata', 'Filet de poulet grillé, laitue, tomates cerises, croûtons, parmesan, sauce César', 99, 4),
  ('Mozzarella Salata', 'Laitue, tomates, mozzarella, sauce de grenadine', 129, 5),
  ('Grecque Salata', 'Fromage de feta, tomate, oignons, concombre, câpre, origan, thym, huile d''olive', 119, 6)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Fresh Salads' AND menu_categories.main = 'lunch';

-- ============================================
-- COLD APPETIZERS
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Acili Ezme', 'Poivrons, tomates, piments, persil et des oignons', 49, 1),
  ('Haydari', 'Yaourt nature, fromage feta, ciboulette et de l''ail', 39, 2),
  ('Humuz', 'Purée de pois chiche, huile d''olive, Tahini et du cumin', 49, 3),
  ('Patlican Salatasi', 'Aubergines, oignons, poivrons, tomates, huile d''olive, persil, jus de citron', 45, 4),
  ('Cerkez Tavugu', 'Blancs de poulet, noix, herbes et de la sauce crémeuse', 69, 5),
  ('Mix Meze', '4 Entrées chaudes & 4 Entrées froides', 199, 6)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Cold Appetizers' AND menu_categories.main = 'lunch';

-- ============================================
-- HOT APPETIZERS
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Karides Tava', 'Crevettes sautées au beurre, à l''ail et au paprika', 69, 1),
  ('Sigara Boregi', 'Cigares farcis au fromage feta', 55, 2),
  ('Arnavut Cigeri', 'Foie d''agneau poêlé aux oignons rouges et au persil', 89, 3),
  ('Mantar Dolma', 'Champignons farcis au fromage et au beurre', 65, 4),
  ('Karides Guvec', 'Crevettes gratinées au fromage et à la sauce crémeuse', 79, 5)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Hot Appetizers' AND menu_categories.main = 'lunch';

-- ============================================
-- CLASSIC DISHES
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Patlican Guvec', 'Ragoût d''agneau, aubergines, tomates, poivrons, sauce tomate', 129, 1),
  ('Sebzeli Guvec', 'Potée de légumes de saison', 95, 2),
  ('Et Sote', 'Cubes d''agneau avec du poivrons', 149, 3),
  ('Tavuk Sote', 'Filet de cuisse de poulet, poivrons et sauce crémeuse', 129, 4),
  ('Kuzu Tandir', 'Agneau au four, tomates, poivrons, oignons et pommes de terre', 189, 5)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Classic Dishes' AND menu_categories.main = 'lunch';

-- ============================================
-- TURKISH PIZZA (Pide)
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Lahmacun', 'Pain plat garni de viande hachée, oignons, tomates, persil et épices', 49, 1),
  ('Etli Ekmek', 'Pide traditionnel avec de la viande hachée et épices', 89, 2),
  ('Mevlana', 'Pide avec de la viande hachée et du fromage feta', 99, 3),
  ('Kusbasili Pide', 'Pide garni de cubes d''agneau, tomates et poivrons', 99, 4)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Turkish Pizza' AND menu_categories.main = 'lunch';

-- ============================================
-- FISH DISHES
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Somon', 'Saumon grillé, légumes sautés, pommes de terre au four et riz turc', 220, 1),
  ('Jumbo Karides Tava', 'Gambas au beurre turc et aux herbes', 289, 2),
  ('Sole de Petit Bateau', 'Filet de sole (500g), citron, beurre, moutarde, épices', 279, 3)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Fish Dishes' AND menu_categories.main = 'lunch';

-- ============================================
-- FAST FOOD
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Cheeseburger', 'Burger d''agneau poêlé aux oignons rouges et au persil', 95, 1),
  ('Chicken Burger', 'Burger au filet de poulet grillé avec une sauce spéciale', 79, 2),
  ('Crispy Chicken Burger', 'Filet de poulet croustillant, dinde fumée, oignons caramélisés, cheddar', 85, 3),
  ('Beymen Burger', 'Filet de bœuf grillé, salami, champignons de Paris sautés, oignons caramélisés, fromage cheddar et gouda', 135, 4)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Fast Food' AND menu_categories.main = 'lunch';

-- ============================================
-- GRILL
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Kuzu Sis', 'Brochettes d''agneau marinées', 179, 1),
  ('Cigeri Sis', 'Brochettes de foie marinées', 139, 2),
  ('Adana Kebab / Tavuk Adana Kebab', 'Brochettes d''agneau hachée / Brochettes de poulet haché', 149, 3),
  ('Kuzu Pirzola', 'Côtelettes d''agneau marinées', 249, 4),
  ('Kasarli Köfte', 'Boulettes de viande rôties au fromage et légumes', 169, 5),
  ('Beymen Tepsi (2P)', 'Un plat de grillade Mixte', 499, 6),
  ('Beyti', 'Pain galette farci à l''agneau haché assaisonné, accompagné d''une purée d''aubergine, sauce tomate et de yaourt', 169, 7),
  ('Bonfile (Lokum)', 'Filet de bœuf grillé', 299, 8),
  ('Tavuk Sis', 'Brochettes de cuisses de poulet marinés', 149, 9),
  ('Yogurtlu Kebab', 'Filet de bœuf grillé, brochettes de la viande hachée, yaourt, sauce tomate et beurre fondu', 189, 10),
  ('Tavuk Kanat', 'Ailes de poulet marinées', 129, 11),
  ('Karisik Izgara', 'Côtelettes, viande hachée, brochettes d''agneau et cuisses de poulet', 249, 12),
  ('Tavuk Gogsu', 'Blanc de poulet mariné', 149, 13),
  ('Tavuk Pirzola', 'Cuisses de poulet marinées', 149, 14)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Grill' AND menu_categories.main = 'lunch';

-- ============================================
-- TURKISH WRAP (Durum)
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Tavuk Dürüm', 'Durum, brochettes de cuisses de poulet grillées, tomates, oignons et laitue', 89, 1),
  ('Sis Dürüm', 'Durum, brochettes d''agneau grillées, tomates, oignons et laitue', 129, 2),
  ('Adana Dürüm', 'Durum, brochettes d''agneau haché, tomates, oignons et laitue', 129, 3),
  ('Ciger Dürüm', 'Durum, foie d''agneau sauté, tomates, oignons et laitue', 119, 4)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Turkish Wrap' AND menu_categories.main = 'lunch';
