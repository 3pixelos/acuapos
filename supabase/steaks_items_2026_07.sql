-- ============================================================
-- Beymen POS — steaks items (Starters, Burgers, Roasts, Steaks,
-- Golden Steaks). Run once in the Supabase SQL Editor.
--
-- Roast prices reflect the pink sticker corrections on the printed menu,
-- confirmed with the owner: Kuzu Kol (2kg) -> 445, Kuzu Gerdan (2kg) -> 389.
-- ============================================================
set search_path = public, extensions;

-- ============================================
-- STARTERS
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Dana Carpaccio', 'Parmesan, moutarde, roca, huile d''olive', 169, 1),
  ('Gavurdagi Salatasi', 'Laitue, tomate, oignon, noix, grenade', 119, 2),
  ('Beymen', 'Fromage de chèvre, noix, figues, sauce orange, mesclun salade, pomme, mélasse de grenade', 129, 3)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Starters' AND menu_categories.main = 'steaks';

-- ============================================
-- BURGERS (servis avec frites)
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Burger Köfte', 'Oignon caramélisé, viande hachée, cheddar', 119, 1),
  ('Lokum Burger', 'Oignon caramélisé, filet de bœuf, cheddar', 165, 2),
  ('Asado Burger', 'Oignon caramélisé, bœuf fumé, cheddar', 139, 3)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Burgers' AND menu_categories.main = 'steaks';

-- ============================================
-- ROASTS (Firinda Kizartmak — servis avec pomme de terre au four,
-- sauce champignons et riz turc)
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Asado (2kg)', 'Côtes courtes de bœuf, rôties pendant 6 heures', 449, 1),
  ('Asado (4kg)', 'Côtes courtes de bœuf, rôties pendant 6 heures', 799, 2),
  ('Kuzu Kol / Gigot d''agneau (2kg)', 'Gigot d''agneau, rôti pendant 6 heures', 445, 3),
  ('Kuzu Gerdan / Collier d''agneau (2kg)', 'Collier d''agneau, rôti pendant 6 heures', 389, 4)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Roasts' AND menu_categories.main = 'steaks';

-- ============================================
-- STEAKS
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Rib Eye 420g', 'Côte de bœuf savoureuse, juteuse et grillée', 349, 1),
  ('Lokum 320g', 'Filet de bœuf (tenderloin)', 349, 2),
  ('New York Steak 420g', 'Surlonge de bœuf désossée coupée en lanières', 369, 3),
  ('Sato Biryan', 'Filet mignon rôti', 599, 4),
  ('New York Cut Lamb Skewer', 'Brochettes d''agneau rôties', 329, 5)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Steaks' AND menu_categories.main = 'steaks';

-- ============================================
-- GOLDEN STEAKS
-- ============================================
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Golden Steak 500g', 'Servi avec frites, sauce épinards & champignons et riz turc', 990, 1),
  ('Golden New York Steak 500g', 'Servi avec frites, sauce épinards & champignons et riz turc', 990, 2),
  ('Golden Tomahawk 1kg', 'Servi avec frites, sauce épinards & champignons, riz turc, acili ezme, haydari, humuz, patlican salatasi, cerkez tavugu', 1990, 3),
  ('Golden Asado 2.5kg', 'Servi avec frites, sauce épinards & champignons, riz turc, acili ezme, haydari, humuz, patlican salatasi, cerkez tavugu', 2490, 4),
  ('Golden Kuzu Kafes 2kg', 'Servi avec frites, sauce épinards & champignons, riz turc, acili ezme, haydari, humuz, patlican salatasi, cerkez tavugu', 2490, 5)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Golden Steaks' AND menu_categories.main = 'steaks';
