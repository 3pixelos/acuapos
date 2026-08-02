-- ============================================================
-- Acua POS — real menu + real floor plan (2026-08)
--
-- Run ONCE in the Supabase SQL Editor of the Acua project, AFTER
-- supabase/acua_schema.sql. It is idempotent: re-running it rebuilds the
-- menu and the floor plan to exactly this state.
--
-- What it does
--   1. adds menu_categories.name_es (Spanish UI)
--   2. replaces the placeholder menu with the 16 real categories + 85 items
--   3. replaces the floor plan with Front Door (3) / Salon (20) /
--      Terrace (20) / Bar (2) / À emporter (3)
--
-- Two things worth knowing before you run it:
--
--   * MENU ROUTING lives in menu_categories.main. 'food' prints in the
--     KITCHEN, 'drinks' prints at the BAR. That is the whole rule — adding
--     a category later only means answering "kitchen or bar?".
--
--   * PRICES ARE IN EUROS, with cents. numeric columns already hold them.
--
-- Deleting menu rows does NOT touch order history: order_items store the
-- item's name, price and category as plain text at the time of the sale.
-- ============================================================
set search_path = public, extensions;

begin;

-- ---------- 1. Spanish category names ----------
alter table menu_categories add column if not exists name_es text;

-- ---------- 2. menu ----------
-- cascade clears menu_items and menu_stock with the categories.
delete from menu_categories;

insert into menu_categories (name_fr, name_en, name_es, main, sort) values
  ('Sandwichs Classiques', 'Classic Sandwiches', 'Bocadillos Clásicos', 'food', 1),
  ('Smash Sandwichs', 'Smash Sandwiches', 'Smash Bocadillos', 'food', 2),
  ('Hamburgers', 'Hamburgers', 'Hamburguesas', 'food', 3),
  ('Pâtes', 'Pastas', 'Pastas', 'food', 4),
  ('Grillades', 'Grilled', 'A la Parrilla', 'food', 5),
  ('Salades', 'Salads', 'Ensaladas', 'food', 6),
  ('Entrées', 'Starters', 'Entrantes', 'food', 7),
  ('Extras et accompagnements', 'Extras and Sides', 'Extras y Guarniciones', 'food', 8),
  ('Cafés et Thés', 'Coffee and Tea', 'Cafés y Tés', 'drinks', 9),
  ('Matcha', 'Matcha', 'Matcha', 'drinks', 10),
  ('Jus Naturels', 'Natural Juices', 'Zumos Naturales', 'drinks', 11),
  ('Shakes Protéinés', 'Protein Shakes', 'Batidos de Proteínas', 'drinks', 12),
  ('Smoothies', 'Smoothies', 'Batidos', 'drinks', 13),
  ('Mocktails', 'Mocktails', 'Mocktails', 'drinks', 14),
  ('Cafés Glacés', 'Iced Coffees', 'Cafés Helados', 'drinks', 15),
  ('Boissons fraîches', 'Soft Drinks', 'Refrescos', 'drinks', 16);

insert into menu_items (category_id, name, price, sort)
select c.id, v.name, v.price, v.sort
from (values
  ('Sandwichs Classiques', 'Chicken Sandwich', 9.95, 1),
  ('Sandwichs Classiques', 'Spicy Chicken Sandwich', 10.95, 2),
  ('Sandwichs Classiques', 'Chicken Satay Sandwich', 10.95, 3),
  ('Sandwichs Classiques', 'Carpaccio Sandwich', 11.95, 4),
  ('Sandwichs Classiques', 'Spicy Tuna Sandwich', 10.95, 5),
  ('Sandwichs Classiques', 'Shrimp Sandwich', 10.95, 6),
  ('Sandwichs Classiques', 'Chicken Wrap', 10.95, 7),
  ('Smash Sandwichs', 'OG Smash Sandwich', 13.95, 1),
  ('Smash Sandwichs', 'Philly Heat Sandwich', 13.95, 2),
  ('Smash Sandwichs', 'BBQ & Bacon Sandwich', 13.95, 3),
  ('Hamburgers', 'Classic Burger', 12.95, 1),
  ('Hamburgers', 'Italian Truffle Burger', 12.95, 2),
  ('Hamburgers', 'Smokey Mayo Burger', 12.95, 3),
  ('Hamburgers', 'Spicy Beast Burger', 12.95, 4),
  ('Hamburgers', 'Burger Maestro', 12.95, 5),
  ('Hamburgers', 'Chicken Fillet Burger', 12.95, 6),
  ('Pâtes', 'Chicken Pasta with Cream', 14.95, 1),
  ('Pâtes', 'Shrimp Pasta', 15.95, 2),
  ('Pâtes', 'Spicy Chicken Pasta', 14.95, 3),
  ('Pâtes', 'Spicy Shrimp Pasta', 15.95, 4),
  ('Pâtes', 'Pasta with Pesto', 13.95, 5),
  ('Grillades', 'Chicken Skewers', 15.95, 1),
  ('Grillades', 'Chicken Thigh', 15.95, 2),
  ('Grillades', 'Chicken Wings', 13.95, 3),
  ('Grillades', 'Lamb Chops', 19.95, 4),
  ('Grillades', 'Mixed Grill', 21.95, 5),
  ('Grillades', 'Satay Dish', 16.95, 6),
  ('Grillades', 'Chicken Dish', 16.95, 7),
  ('Grillades', 'Minced Meat Dish', 16.95, 8),
  ('Salades', 'Caesar Salad', 11.95, 1),
  ('Salades', 'Greek Salad', 11.95, 2),
  ('Salades', 'Arugula Salad', 11.95, 3),
  ('Entrées', 'Hummus', 4.95, 1),
  ('Entrées', 'Tzatziki', 4.95, 2),
  ('Entrées', 'Creamy Chicken and Walnut Salad', 5.95, 3),
  ('Extras et accompagnements', 'French Fries', 3.50, 1),
  ('Extras et accompagnements', 'Sweet Potato Fries', 4.50, 2),
  ('Extras et accompagnements', 'Garlic Sauce', 1.50, 3),
  ('Extras et accompagnements', 'Chile Sauce', 1.50, 4),
  ('Extras et accompagnements', 'Truffle Mayonnaise', 1.75, 5),
  ('Extras et accompagnements', 'Pita Bread', 2.00, 6),
  ('Extras et accompagnements', 'Salsa Sweet Chili', 1.50, 7),
  ('Cafés et Thés', 'Espresso', 2.20, 1),
  ('Cafés et Thés', 'Double Espresso', 2.90, 2),
  ('Cafés et Thés', 'Americano', 3.20, 3),
  ('Cafés et Thés', 'Cappuccino', 3.50, 4),
  ('Cafés et Thés', 'Latte Macchiato', 3.90, 5),
  ('Cafés et Thés', 'Flat White', 3.50, 6),
  ('Cafés et Thés', 'Tea', 2.50, 7),
  ('Matcha', 'Matcha Ice Cream', 5.50, 1),
  ('Matcha', 'Strawberry Matcha', 6.50, 2),
  ('Matcha', 'Mango Matcha', 6.50, 3),
  ('Matcha', 'Coconut Matcha', 6.50, 4),
  ('Jus Naturels', 'Orange', 4.95, 1),
  ('Jus Naturels', 'Orange and Mango', 5.95, 2),
  ('Jus Naturels', 'Watermelon', 5.50, 3),
  ('Jus Naturels', 'Green Detox', 5.95, 4),
  ('Jus Naturels', 'Passion Fruit', 5.95, 5),
  ('Shakes Protéinés', 'Vanilla', 6.95, 1),
  ('Shakes Protéinés', 'Chocolate', 6.95, 2),
  ('Shakes Protéinés', 'Strawberry', 6.95, 3),
  ('Shakes Protéinés', 'Banana', 6.95, 4),
  ('Smoothies', 'Oreo', 6.95, 1),
  ('Smoothies', 'Lotus', 6.95, 2),
  ('Smoothies', 'Kinder Bueno', 6.95, 3),
  ('Smoothies', 'Bounty', 6.95, 4),
  ('Smoothies', 'Coco', 6.95, 5),
  ('Smoothies', 'Strawberry', 6.50, 6),
  ('Smoothies', 'Vanilla', 6.50, 7),
  ('Mocktails', 'Acua Sunset', 6.95, 1),
  ('Mocktails', 'Tropical Passion', 6.95, 2),
  ('Mocktails', 'Berry Fresh', 6.95, 3),
  ('Mocktails', 'Virgin Mojito', 6.95, 4),
  ('Cafés Glacés', 'Iced Latte', 4.50, 1),
  ('Cafés Glacés', 'Iced Caramel Latte', 4.95, 2),
  ('Cafés Glacés', 'Iced Mocha', 4.95, 3),
  ('Cafés Glacés', 'Iced Vanilla Latte', 4.95, 4),
  ('Boissons fraîches', 'Coca-Cola', 2.80, 1),
  ('Boissons fraîches', 'Coca-Cola Zero', 2.80, 2),
  ('Boissons fraîches', 'Fanta', 2.80, 3),
  ('Boissons fraîches', 'Sprite', 2.80, 4),
  ('Boissons fraîches', 'Iced Tea', 2.80, 5),
  ('Boissons fraîches', 'Sparkling Water', 2.50, 6),
  ('Boissons fraîches', 'Mineral Water', 2.50, 7),
  ('Boissons fraîches', 'Red Bull', 3.50, 8)
) as v(cat_fr, name, price, sort)
join menu_categories c on c.name_fr = v.cat_fr;

-- ---------- 3. floor plan ----------
-- Safety: refuse to rebuild the floor while a table is still open, or the
-- live sessions would point at table ids that no longer exist.
do $$
begin
  if exists (select 1 from table_sessions where closed_at is null and not cancelled) then
    raise exception 'Open table sessions exist — close/free every table before rebuilding the floor plan.';
  end if;
end $$;

delete from restaurant_tables;

insert into restaurant_tables (id, label, seats, zone, layer, sort, vip, x, y, branch) values
  ('FD1', 'FD1', 2, 'Entrée', 'frontdoor', 1, false, 16, 20, 'main'),
  ('FD2', 'FD2', 2, 'Entrée', 'frontdoor', 2, false, 42, 20, 'main'),
  ('FD3', 'FD3', 2, 'Entrée', 'frontdoor', 3, false, 68, 20, 'main'),
  ('S1', 'S1', 2, 'Salon', 'salon', 1, false, 8, 12, 'main'),
  ('S2', 'S2', 2, 'Salon', 'salon', 2, false, 29, 12, 'main'),
  ('S3', 'S3', 2, 'Salon', 'salon', 3, false, 50, 12, 'main'),
  ('S4', 'S4', 2, 'Salon', 'salon', 4, false, 71, 12, 'main'),
  ('S5', 'S5', 2, 'Salon', 'salon', 5, false, 92, 12, 'main'),
  ('S6', 'S6', 2, 'Salon', 'salon', 6, false, 8, 34, 'main'),
  ('S7', 'S7', 2, 'Salon', 'salon', 7, false, 29, 34, 'main'),
  ('S8', 'S8', 2, 'Salon', 'salon', 8, false, 50, 34, 'main'),
  ('S9', 'S9', 4, 'Salon', 'salon', 9, false, 71, 34, 'main'),
  ('S10', 'S10', 4, 'Salon', 'salon', 10, false, 92, 34, 'main'),
  ('S11', 'S11', 4, 'Salon', 'salon', 11, false, 8, 56, 'main'),
  ('S12', 'S12', 4, 'Salon', 'salon', 12, false, 29, 56, 'main'),
  ('S13', 'S13', 4, 'Salon', 'salon', 13, false, 50, 56, 'main'),
  ('S14', 'S14', 4, 'Salon', 'salon', 14, false, 71, 56, 'main'),
  ('S15', 'S15', 4, 'Salon', 'salon', 15, false, 92, 56, 'main'),
  ('S16', 'S16', 4, 'Salon', 'salon', 16, false, 8, 78, 'main'),
  ('S17', 'S17', 6, 'Salon', 'salon', 17, false, 29, 78, 'main'),
  ('S18', 'S18', 6, 'Salon', 'salon', 18, false, 50, 78, 'main'),
  ('S19', 'S19', 6, 'Salon', 'salon', 19, false, 71, 78, 'main'),
  ('S20', 'S20', 6, 'Salon', 'salon', 20, false, 92, 78, 'main'),
  ('T1', 'T1', 2, 'Terrasse', 'terrasse', 1, false, 8, 12, 'main'),
  ('T2', 'T2', 2, 'Terrasse', 'terrasse', 2, false, 29, 12, 'main'),
  ('T3', 'T3', 2, 'Terrasse', 'terrasse', 3, false, 50, 12, 'main'),
  ('T4', 'T4', 2, 'Terrasse', 'terrasse', 4, false, 71, 12, 'main'),
  ('T5', 'T5', 2, 'Terrasse', 'terrasse', 5, false, 92, 12, 'main'),
  ('T6', 'T6', 2, 'Terrasse', 'terrasse', 6, false, 8, 34, 'main'),
  ('T7', 'T7', 2, 'Terrasse', 'terrasse', 7, false, 29, 34, 'main'),
  ('T8', 'T8', 2, 'Terrasse', 'terrasse', 8, false, 50, 34, 'main'),
  ('T9', 'T9', 4, 'Terrasse', 'terrasse', 9, false, 71, 34, 'main'),
  ('T10', 'T10', 4, 'Terrasse', 'terrasse', 10, false, 92, 34, 'main'),
  ('T11', 'T11', 4, 'Terrasse', 'terrasse', 11, false, 8, 56, 'main'),
  ('T12', 'T12', 4, 'Terrasse', 'terrasse', 12, false, 29, 56, 'main'),
  ('T13', 'T13', 4, 'Terrasse', 'terrasse', 13, false, 50, 56, 'main'),
  ('T14', 'T14', 4, 'Terrasse', 'terrasse', 14, false, 71, 56, 'main'),
  ('T15', 'T15', 4, 'Terrasse', 'terrasse', 15, false, 92, 56, 'main'),
  ('T16', 'T16', 4, 'Terrasse', 'terrasse', 16, false, 8, 78, 'main'),
  ('T17', 'T17', 6, 'Terrasse', 'terrasse', 17, false, 29, 78, 'main'),
  ('T18', 'T18', 6, 'Terrasse', 'terrasse', 18, false, 50, 78, 'main'),
  ('T19', 'T19', 6, 'Terrasse', 'terrasse', 19, false, 71, 78, 'main'),
  ('T20', 'T20', 6, 'Terrasse', 'terrasse', 20, false, 92, 78, 'main'),
  ('B1', 'B1', 2, 'Bar', 'bar', 1, false, 30, 40, 'main'),
  ('B2', 'B2', 2, 'Bar', 'bar', 2, false, 60, 40, 'main'),
  ('EMP1', 'EMP1', 1, 'Emporter', 'emporter', 1, false, 20, 40, 'main'),
  ('EMP2', 'EMP2', 1, 'Emporter', 'emporter', 2, false, 44, 40, 'main'),
  ('EMP3', 'EMP3', 1, 'Emporter', 'emporter', 3, false, 68, 40, 'main');

commit;

-- ---------- verify ----------
-- Expect: 16 categories (8 food + 8 drinks), 85 items, 48 tables.
select main, count(*) as categories from menu_categories group by main order by main;
select c.name_fr, count(i.id) as items
from menu_categories c left join menu_items i on i.category_id = c.id
group by c.name_fr, c.sort order by c.sort;
select layer, count(*) as tables from restaurant_tables group by layer order by layer;
