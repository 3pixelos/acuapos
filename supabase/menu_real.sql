-- ============================================================
-- Beymen — real menu import (replaces the placeholder menu).
-- Run once in Supabase SQL Editor, after schema.sql.
-- Item descriptions are formatted "English — Français".
-- ============================================================

delete from menu_items;
delete from menu_categories;

-- ---------- categories ----------
insert into menu_categories (name_fr, name_en, sort) values
  ('Soupes',                        'Soups',                       1),
  ('Salades',                       'Salads',                      2),
  ('Entrées Froides',               'Cold Appetizers',             3),
  ('Entrées Chaudes',               'Hot Appetizers',              4),
  ('Entrées Steakhouse',            'Steakhouse Starters',         5),
  ('Plats Mijotés',                 'Stews & Casseroles',          6),
  ('Pide',                          'Turkish Pizza (Pide)',        7),
  ('Poissons',                      'Fish',                        8),
  ('Fast Food',                     'Fast Food',                   9),
  ('Burgers Steakhouse',            'Steakhouse Burgers',          10),
  ('Grillades',                     'Grill',                       11),
  ('Durum',                         'Turkish Wrap',                12),
  ('Rôtis',                         'Roasts',                      13),
  ('Steaks',                        'Steaks',                      14),
  ('Golden Steaks',                 'Golden Steaks',               15),
  ('Sucreries Traditionnelles',     'Traditional Sweets',          16),
  ('Sucreries Gourmandes',          'Delicious Sweets',            17),
  ('Jus & Smoothies',               'Juices & Smoothies',          18),
  ('Mocktails',                     'Mocktails',                   19),
  ('Mojitos, Milkshakes & Sodas',   'Mojitos, Milkshakes & Sodas', 20),
  ('Thés',                          'Teas',                        21),
  ('Cafés',                         'Coffees',                     22),
  ('Petit-déjeuner à la carte',     'Breakfast à la carte',        23),
  ('Petit-déjeuner Cuisiné',        'Cooked Breakfast',            24),
  ('Formules Petit-déjeuner',       'Breakfast Set Menus',         25);

-- ---------- 1. Soupes / Soups ----------
insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.description, v.price, v.sort
from menu_categories c,
(values
  ('Mercimek Çorbasi', 'Lentil soup — Soupe aux lentilles', 45, 1),
  ('Tavuk Çorba',      'Chicken soup — Soupe au poulet',    55, 2)
) as v(name, description, price, sort)
where c.name_fr = 'Soupes';

-- ---------- 2. Salades / Salads ----------
insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.description, v.price, v.sort
from menu_categories c,
(values
  ('Kasik Salata',       'Tomatoes, onions, peppers, parsley, cucumbers, olive oil, grenadine sauce — Tomates, oignons, poivrons, persil, concombres, huile d''olive et sauce de grenadine', 59, 1),
  ('Roka Salata',        'Arugula salad, parmesan, cherry tomatoes, pine nuts, grenadine sauce — Salade de roquette, parmesan, tomates cerises, pignons de pin et sauce de grenadine', 65, 2),
  ('Avocado Salata',     'Avocado, cherry tomatoes, cucumbers, lettuce, arugula, olive oil, lemon juice — Avocat, tomates cerises, concombres, laitue, roquette, huile d''olive et jus de citron', 89, 3),
  ('Tavuku Sezar Salata','Grilled chicken fillet, lettuce, cherry tomatoes, croutons, parmesan, caesar sauce — Filet de poulet grillé, laitue, tomates cerises, croûtons, parmesan et sauce césar', 99, 4),
  ('Mozzarella Salata',  'Lettuce, tomatoes, mozzarella, grenadine sauce — Laitue, tomates, mozzarella, sauce de grenadine', 129, 5),
  ('Grecque Salata',     'Feta cheese, tomato, onions, cucumber, caper, oregano, thyme, olive oil — Fromage de feta, tomate, oignons, concombre, câpre, origan, thym, huile d''olive', 119, 6)
) as v(name, description, price, sort)
where c.name_fr = 'Salades';

-- ---------- 3. Entrées Froides / Cold Appetizers ----------
insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.description, v.price, v.sort
from menu_categories c,
(values
  ('Acili Ezme',        'Bell peppers, tomatoes, chili pepper, parsley, onions — Poivrons, tomates, piments, persil et des oignons', 49, 1),
  ('Haydari',           'Plain yogurt, feta cheese, chives, garlic — Yaourt nature, fromage feta, ciboulette et de l''ail', 39, 2),
  ('Humuz',             'Chickpea puree, olive oil, tahini, cumin — Purée de pois chiche, huile d''olive, Tahini (crème de sésame) et du cumin', 49, 3),
  ('Patlican Salatasi', 'Eggplants, onions, peppers, tomatoes, olive oil, parsley, lemon juice — Aubergines, oignons, poivrons, tomates, huile d''olive, persil et jus de citron', 45, 4),
  ('Cerkez Tavugu',     'Chicken breasts, walnuts, herbs, creamy sauce — Blancs de poulet, noix, herbes et de la sauce crémeuse', 69, 5),
  ('Mix Meze',          '4 hot & 4 cold appetizers — 4 Entrées chaudes & 4 Entrées froides', 199, 6)
) as v(name, description, price, sort)
where c.name_fr = 'Entrées Froides';

-- ---------- 4. Entrées Chaudes / Hot Appetizers ----------
insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.description, v.price, v.sort
from menu_categories c,
(values
  ('Karides Tava',   'Fried shrimps cooked in butter, garlic and paprika — Crevettes sautées au beurre, à l''ail et au paprika', 69, 1),
  ('Sigara Boregi',  'Crunchy rolls of pastry filled with feta cheese — Cigares farcis au fromage feta', 55, 2),
  ('Arnavut Cigeri', 'Fried lamb liver with red onions and parsley — Foie d''agneau poêlé aux oignons rouges et au persil', 89, 3),
  ('Mantar Dolma',   'Mushrooms stuffed with cheese and butter — Champignons farcis au fromage et au beurre', 65, 4),
  ('Karides Guvec',  'Baked shrimps with creamy sauce and cheese — Crevettes gratinées au fromage et à la sauce crémeuse', 79, 5)
) as v(name, description, price, sort)
where c.name_fr = 'Entrées Chaudes';

-- ---------- 5. Entrées Steakhouse ----------
insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.description, v.price, v.sort
from menu_categories c,
(values
  ('Dana Carpaccio',    'Parmesan, mustard, roca, olive oil — Parmesan, Moutarde, Roca, Huile d''olive', 169, 1),
  ('Gavurdagi Salatasi','Lettuce, tomato, onion, walnuts and pomegranate — Laitue, Tomate, Oignon, Noix et Grenade', 119, 2),
  ('Beymen Salatasi',   'Goat cheese, nuts, figs, orange sauce, mixed salad, apple, pomegranate molasses — Fromage de chèvre, Noix, Figues, Orange sauce, Mesclun salade, Pomme, Mélasse de grenade', 129, 3)
) as v(name, description, price, sort)
where c.name_fr = 'Entrées Steakhouse';

-- ---------- 6. Plats Mijotés / Stews & Casseroles ----------
insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.description, v.price, v.sort
from menu_categories c,
(values
  ('Patlican Guvec', 'Lamb stew, eggplants, tomatoes, green peppers, garlic, tomato sauce — Ragoût d''agneau, aubergines, tomates, poivrons verts, ail, sauce tomate', 129, 1),
  ('Sebzeli Guvec',  'Seasonal vegetables hotpot — Potée de légumes de saison', 95, 2),
  ('Et Sote',        'Cubed lamb with peppers — Cubes d''agneau avec du poivrons', 149, 3),
  ('Tavuk Sote',     'Chicken thigh filet, peppers and creamy sauce — Filet de cuisse de poulet, poivrons et sauce crémeuse', 129, 4),
  ('Kuzu Tandir',    'Lamb in the oven, tomatoes, peppers, onions and potatoes — Agneau au four, tomates, poivrons, oignons et pommes de terre', 189, 5)
) as v(name, description, price, sort)
where c.name_fr = 'Plats Mijotés';

-- ---------- 7. Pide / Turkish Pizza ----------
insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.description, v.price, v.sort
from menu_categories c,
(values
  ('Lahmacun',       'Thin dough topped with minced meat, onions, tomatoes, parsley and spices — Pain plat garni de viande hachée, oignons, tomates, persil et épices', 49, 1),
  ('Etli Ekmek',     'Traditional pide with minced meat and spices — Pide traditionnel avec de la viande hachée et épices', 89, 2),
  ('Mevlana',        'Pide with minced meat and feta cheese — Pide avec de la viande hachée et du fromage feta', 99, 3),
  ('Kusbasili Pide', 'Pide topped with lamb cubes, tomatoes and peppers — Pide garni de cubes d''agneau, tomates et poivrons', 99, 4)
) as v(name, description, price, sort)
where c.name_fr = 'Pide';

-- ---------- 8. Poissons / Fish ----------
insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.description, v.price, v.sort
from menu_categories c,
(values
  ('Somon',              'Grilled salmon, roasted vegetables, baked potatoes and turkish rice — Saumon grillé, légumes sautés, pommes de terre au four et riz turc', 220, 1),
  ('Jumbo Karides Tava', 'Prawns with turkish butter and spicy herbs — Gambas au beurre turc et aux herbes', 289, 2),
  ('Sole de Petit Bateau','Fillet of sole (500g), lemon, butter, mustard, spices — Filet de sole (500g), citron, beurre, moutarde, épices', 279, 3)
) as v(name, description, price, sort)
where c.name_fr = 'Poissons';

-- ---------- 9. Fast Food ----------
insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.description, v.price, v.sort
from menu_categories c,
(values
  ('Cheeseburger',         'Lamb burger with red onions and parsley — Burger d''agneau poêlé aux oignons rouges et au persil (servi avec frites)', 95, 1),
  ('Chicken Burger',       'Grilled chicken burger with special sauce — Burger au filet de poulet grillé avec une sauce spéciale (servi avec frites)', 79, 2),
  ('Crispy Chicken Burger','Crispy chicken fillet, smoked turkey ham, caramelized onions, cheddar — Filet de poulet croustillant, dinde fumée, oignons caramélisés, cheddar (servi avec frites)', 85, 3),
  ('Beymen Burger',        'Grilled beef fillet, salami, sauteed mushrooms, caramelized onions, cheddar and gouda cheese — Filet de bœuf grillé, salami, champignons de paris sautés, oignons caramélisés, fromage cheddar et gouda (servi avec frites)', 135, 4)
) as v(name, description, price, sort)
where c.name_fr = 'Fast Food';

-- ---------- 10. Burgers Steakhouse ----------
insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.description, v.price, v.sort
from menu_categories c,
(values
  ('Burger Köfte', 'Caramelized onion, minced meat, cheddar — Oignon caramélisé, viande hachée, cheddar (servi avec frites)', 119, 1),
  ('Lokum Burger', 'Caramelized onion, beef tenderloin, cheddar — Oignon caramélisé, filet de bœuf, cheddar (servi avec frites)', 165, 2),
  ('Asado Burger', 'Caramelized onion, smoked beef, cheddar — Oignon caramélisé, bœuf fumé, cheddar (servi avec frites)', 139, 3)
) as v(name, description, price, sort)
where c.name_fr = 'Burgers Steakhouse';

-- ---------- 11. Grillades / Grill ----------
insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.description, v.price, v.sort
from menu_categories c,
(values
  ('Kuzu Sis',           'Marinated lamb skewers — Brochettes d''agneau marinées', 179, 1),
  ('Cigeri Sis',         'Marinated liver skewers — Brochettes de foie marinées', 139, 2),
  ('Adana Kebab',        'Ground lamb skewers — Brochettes d''agneau hachée', 149, 3),
  ('Tavuk Adana Kebab',  'Ground chicken skewers — Brochettes de poulet hachée', 149, 4),
  ('Kuzu Pirzola',       'Marinated lamb chop — Côtelettes d''agneau marinées', 249, 5),
  ('Kasarli Köfte',      'Roasted meatballs with cheese and vegetables — Boulettes de viande rôties au fromage et légumes', 169, 6),
  ('Beymen Tepsi (2p)',  'A mixed grill platter — Un plat de grillade Mixte', 499, 7),
  ('Beyti',              'Seasoned ground lamb wrapped in filo pastry, eggplant puree, tomato sauce and yogurt — Pain galette farci à l''agneau haché assaisonné, purée d''aubergine, sauce tomate et yaourt', 169, 8),
  ('Bonfile (Lokum)',    'Grilled beef tenderloin — Filet de bœuf grillé', 299, 9),
  ('Tavuk Sis',          'Marinated chicken-thigh skewers — Brochettes de cuisses de poulet marinées', 149, 10),
  ('Yogurtlu Kebab',     'Grilled beef tenderloin, ground lamb skewers, yogurt, tomato sauce and melted butter — Filet de bœuf grillé, brochettes de viande hachée, yaourt, sauce tomate et beurre fondu', 189, 11),
  ('Tavuk Kanat',        'Marinated chicken wings — Ailes de poulet marinées', 129, 12),
  ('Karisik Izgara',     'Lamb chop, minced meat, lamb skewers and chicken thigh — Côtelettes, viande hachée, brochettes d''agneau et cuisses de poulet', 249, 13),
  ('Tavuk Gogsu',        'Marinated chicken breast — Blanc de poulet mariné', 149, 14),
  ('Tavuk Pirzola',      'Marinated chicken thighs — Cuisses de poulet marinées', 149, 15)
) as v(name, description, price, sort)
where c.name_fr = 'Grillades';

-- ---------- 12. Durum / Turkish Wrap ----------
insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.description, v.price, v.sort
from menu_categories c,
(values
  ('Tavuk Dürüm', 'Grilled chicken thigh skewer, tomatoes, onions and lettuce — Brochettes de cuisses de poulet grillées, tomates, oignons et laitue (servi avec frites)', 89, 1),
  ('Sis Dürüm',   'Grilled lamb skewer, tomatoes, onions and lettuce — Brochettes d''agneau grillées, tomates, oignons et laitue (servi avec frites)', 129, 2),
  ('Adana Dürüm', 'Ground lamb skewers, tomatoes, onions and lettuce — Brochettes d''agneau hachée, tomates, oignons et laitue (servi avec frites)', 129, 3),
  ('Ciger Dürüm', 'Sauteed lamb liver, tomatoes, onions and lettuce — Foie d''agneau sauté, tomates, oignons et laitue (servi avec frites)', 119, 4)
) as v(name, description, price, sort)
where c.name_fr = 'Durum';

-- ---------- 13. Rôtis / Roasts (served with baked potato, mushroom sauce, turkish rice) ----------
insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.description, v.price, v.sort
from menu_categories c,
(values
  ('Asado (2kg)',              'Beef short ribs, roasted for 6 hours — Côtes courtes de bœuf, rôties pendant 6 heures', 449, 1),
  ('Asado (4kg)',              'Beef short ribs, roasted for 6 hours — Côtes courtes de bœuf, rôties pendant 6 heures', 799, 2),
  ('Kuzu Kol / Leg of Lamb',   'Leg of lamb, roasted for 6 hours — Gigot d''agneau, rôti pendant 6 heures', 389, 3),
  ('Kuzu Gerdan / Lamb Neck',  'Lamb neck, roasted for 6 hours — Collier d''agneau, rôti pendant 6 heures', 289, 4)
) as v(name, description, price, sort)
where c.name_fr = 'Rôtis';

-- ---------- 14. Steaks (served with baked potato, mushroom sauce, turkish rice) ----------
insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.description, v.price, v.sort
from menu_categories c,
(values
  ('Kuzu Kafes',              'Grilled rack of lamb on a charcoal (1.5kg) — Carré d''agneau grillé sur charbon (1,5kg)', 799, 1),
  ('Tomahawk',                'Marinated bone-in ribeye steak (1.1kg) — Steak de cowboy mariné (1,1kg)', 749, 2),
  ('T-Bone',                  'Marinated beef short-loin (450g) — Longe courte de bœuf marinée (450g)', 320, 3),
  ('Dallas',                  'Beef loin (450g) — Longe de bœuf (450g)', 320, 4),
  ('Rib Eye',                 'Grilled, tender, juicy beef rib (420g) — Côte de bœuf savoureuse, juteuse et grillée (420g)', 349, 5),
  ('Lokum',                   'Beef fillet / tenderloin (320g) — Filet de bœuf (320g)', 349, 6),
  ('New York Steak',          'Boneless beef sirloin cut into strips (420g) — Surlonge de bœuf désossée coupée en lanières (420g)', 369, 7),
  ('Šato Biryan',             'Roasted filet mignon — Filet mignon rôti', 599, 8),
  ('New York Cut Lamb Skewer','Roasted lamb skewers — Brochettes d''agneau rôties', 329, 9)
) as v(name, description, price, sort)
where c.name_fr = 'Steaks';

-- ---------- 15. Golden Steaks (served with fries, spinach & mushroom sauce, turkish rice) ----------
insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.description, v.price, v.sort
from menu_categories c,
(values
  ('Golden Steak (500g)',           'Served with fries, spinach & mushroom sauce and turkish rice — Servi avec frites, épinards, sauce champignons et riz turc', 990, 1),
  ('Golden New York Steak (500g)',  'Served with fries, spinach & mushroom sauce and turkish rice — Servi avec frites, épinards, sauce champignons et riz turc', 990, 2),
  ('Golden Tomahawk (1kg)',         'Served with fries, spinach & mushroom sauce, turkish rice, acili ezme, haydari, humuz, patlican salatasi, cerkez tavugu', 1990, 3),
  ('Golden Asado (2.5kg)',          'Served with fries, spinach & mushroom sauce, turkish rice, acili ezme, haydari, humuz, patlican salatasi, cerkez tavugu', 2490, 4),
  ('Golden Kuzu Kafes (2kg)',       'Served with fries, spinach & mushroom sauce, turkish rice, acili ezme, haydari, humuz, patlican salatasi, cerkez tavugu', 2490, 5)
) as v(name, description, price, sort)
where c.name_fr = 'Golden Steaks';

-- ---------- 16. Sucreries Traditionnelles / Traditional Sweets ----------
insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.description, v.price, v.sort
from menu_categories c,
(values
  ('Kunefe',       'Kunefe with cheese and vanilla ice cream — Kunefe au fromage et glace à la vanille', 69, 1),
  ('Havuc Dilimi', 'Baklava served with vanilla ice cream — Baklava servi avec de la glace vanille', 65, 2),
  ('Sutlac',       'Turkish rice pudding — Riz au lait à la turque', 45, 3),
  ('Baklava',      'Layers of phyllo dough filled with honey and loads of pistachios — Pâtisserie feuilletée à la pistache et au miel', 55, 4),
  ('Kazandibi',    'Caramelized milk pudding with vanilla ice cream and cinnamon — Pudding au lait caramélisé à la glace vanille et cannelle', 45, 5)
) as v(name, description, price, sort)
where c.name_fr = 'Sucreries Traditionnelles';

-- ---------- 17. Sucreries Gourmandes / Delicious Sweets ----------
insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.description, v.price, v.sort
from menu_categories c,
(values
  ('Beymen Tatli (2p)',       'A platter of various seasonal fruits served with ice cream and whipped cream — Un plateau de fruits de saison variés servi avec de la glace et de la crème fraiche', 225, 1),
  ('Beymen Tatli (4p Show)',  'Seasonal fruit platter with ice cream & whipped cream, 2 pieces of cake, havuc dilimi, sutlac — Plateau de fruits, glace et crème fraiche, 2 pièces gâteau, havuc dilimi, sutlac', 389, 2),
  ('Tiramisu',                '', 69, 3),
  ('San Sebastian',           '', 69, 4),
  ('Trilece',                 '', 59, 5),
  ('Red Velvet Cheesecake',   '', 69, 6),
  ('Cheesecake',              '', 59, 7),
  ('Fondant au Chocolat',     '', 79, 8),
  ('Choco Berry',             'Fluffy pancake x2, red fruits, chocolate chips, mascarpone, hazelnuts — Pancake moelleux x2, fruits rouges, pépites de chocolat, mascarpone, noisette', 75, 9),
  ('Caramel Pancake',         'Fluffy pancake x2, caramel, vanilla ice cream, almonds, brown sugar — Pancake moelleux x2, caramel, glace vanille, amandes, cassonade', 75, 10),
  ('Crêpe ou Gaufre Nature',  'Plain or with sugar — Nature ou au sucre', 22, 11),
  ('Crêpe ou Gaufre Nutella', 'Nutella sauce — Sauce Nutella', 32, 12),
  ('Crêpe Pistachio Kunafa',  'Pistachio and kunafa — Pistache et Kunafa', 65, 13),
  ('Kids Menu Pancake',       'Fluffy pancake x1, Nutella', 49, 14)
) as v(name, description, price, sort)
where c.name_fr = 'Sucreries Gourmandes';

-- ---------- 18. Jus & Smoothies / Juices & Smoothies ----------
insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.description, v.price, v.sort
from menu_categories c,
(values
  ('Rose Paradis',              'Strawberry, banana, orange — Fraise, banane, orange', 55, 1),
  ('Mango',                     'Mango, yogurt, banana, passion fruit, orange — Mangue, yaourt, banane, fruits de la passion, orange', 59, 2),
  ('Pink Panther',               'Red fruits, vanilla ice cream, banana, pressed apple juice — Fruits rouges, glace à la vanille, banane, jus de pomme pressée', 59, 3),
  ('Strawberry Smoothie',        'Strawberry, banana, apple, orange — Fraise, banane, pomme, orange', 59, 4),
  ('Ginger Smoothie',            'Ginger, apple, mango, orange — Gingembre, pomme, mangue, orange', 59, 5),
  ('Happy Heart',                'Pineapple, strawberry, apple, banana, orange — Ananas, fraise, pomme, banane, orange', 69, 6),
  ('Miami',                      'Peach, pineapple, mango, passion fruit, mint — Pêche, ananas, mangue, fruits de la passion, menthe', 69, 7),
  ('Jus d''Ananas Pressé',       'Pressed pineapple juice — Jus d''ananas pressé', 89, 8),
  ('Jus de Pomme Pressé',        'Pressed apple juice — Jus de pomme pressé', 79, 9),
  ('Jus de Pastèque Pressé',     'Pressed watermelon juice — Jus de pastèque pressé', 79, 10),
  ('Jus Mix Pressé',             'Pressed mixed fruit juice — Jus de fruits mixés pressé', 89, 11),
  ('Jus d''Orange',              'Orange juice — Jus d''orange', 35, 12),
  ('Jus de Citron',              'Lemon juice — Jus de citron', 35, 13),
  ('Jus de Carotte',             'Carrot juice — Jus de carotte', 35, 14),
  ('Jus de Banane',              'Banana juice — Jus de banane', 35, 15),
  ('Jus de Pomme',               'Apple juice — Jus de pomme', 35, 16),
  ('Jus de Fraise',              'Strawberry juice — Jus de fraise', 40, 17),
  ('Jus de Fraise-Banane',       'Strawberry-banana juice — Jus de fraise-banane', 45, 18),
  ('Jus de Kiwi',                'Kiwi juice — Jus de kiwi', 45, 19),
  ('Jus de Fruits Rouges',       'Red fruit juice — Jus de fruits rouges', 50, 20),
  ('Jus d''Avocat',              'Avocado juice — Jus d''avocat', 50, 21),
  ('Jus d''Avocat aux Fruits Secs','Avocado juice with dried fruits — Jus d''avocat aux fruits secs', 59, 22),
  ('Jus de Fruits de Saison',    'Seasonal fruits juice — Jus de fruits de saison', 55, 23),
  ('Jus d''Ananas',              'Pineapple juice — Jus d''ananas', 55, 24),
  ('Jus de Mangue',              'Mango juice — Jus de mangue', 59, 25)
) as v(name, description, price, sort)
where c.name_fr = 'Jus & Smoothies';

-- ---------- 19. Mocktails ----------
insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.description, v.price, v.sort
from menu_categories c,
(values
  ('Green Life',      'Lemon, passion fruit, pineapple, blue curaçao, pina, orange — Citron, fruits de la passion, ananas, curaçao bleu, pina, orange', 55, 1),
  ('Blue Life',       'Coconut, blue curaçao, lemon, sprite — Coco, curaçao bleu, citron, sprite', 55, 2),
  ('Bora Bora',       'Grenadine syrup, orange juice, passion fruit, sprite, blue curaçao — Sirop de grenadine, jus d''orange, fruits de la passion, sprite, curaçao bleu', 69, 3),
  ('Sunrise',         'Grenadine syrup, orange juice, pure peach — Sirop de grenadine, jus d''orange, pure pêche', 69, 4),
  ('Tropical Blue',   'Pina, pure coconut, pure pineapple, blue curaçao, sprite — Pina, pure coco, pure ananas, curaçao bleu, sprite', 69, 5),
  ('Virgin Colada',   'Pineapple, pure coconut, coconut milk, pineapple juice — Ananas, pure coco, lait de coco, jus d''ananas', 69, 6),
  ('Kiwi King',       'Kiwi, lemon, orange, mint, cane sugar syrup, sprite — Kiwi, citron, orange, menthe, sirop de sucre de canne, sprite', 69, 7),
  ('Beymen Mocktail', 'Pineapple juice, orange juice, passion fruit, soda, blue curaçao, grenadine syrup — Jus d''ananas, jus d''orange, fruit de la passion, soda, curaçao bleu, sirop de grenadine', 89, 8),
  ('Sangria (Mocktail)', 'Red fruits, orange juice, mixed fruits, cinnamon, lemon — Fruits rouges, jus d''orange, mix de fruits, cannelle, citron', 79, 9),
  ('Citronade',       'Honey, lemon, mint — Miel, citron, menthe', 45, 10),
  ('Detox',           'Lemon, orange, carrot, ginger, pressed apple juice — Citron, orange, carotte, gingembre, jus de pomme pressée', 59, 11),
  ('Cindrella',       'Orange juice, pineapple juice, pure strawberry — Jus d''orange, jus d''ananas, pure fraise', 55, 12),
  ('Pink Coco',       'Pineapple, pure coconut, strawberry, coconut milk — Ananas, pure coco, fraise, lait de coco', 69, 13),
  ('Iran',            'Natural yogurt, oulmès, salt — Yaourt nature, oulmès, sel', 29, 14),
  ('Blue Lagoon',     'Pineapple juice, sprite, monin syrup — Jus d''ananas, sprite, sirop de monin', 79, 15)
) as v(name, description, price, sort)
where c.name_fr = 'Mocktails';

-- ---------- 20. Mojitos, Milkshakes & Sodas ----------
insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.description, v.price, v.sort
from menu_categories c,
(values
  ('Virgin Mojito Classic',    '', 69, 1),
  ('Virgin Mojito Strawberry', '', 79, 2),
  ('Virgin Mojito Blueberry',  '', 79, 3),
  ('Mojito Redbull',           '', 89, 4),
  ('Milkshake Chocolat',       '', 45, 5),
  ('Milkshake Vanille',        '', 45, 6),
  ('Milkshake Noisette',       '', 45, 7),
  ('Milkshake Fraise',         '', 40, 8),
  ('Milkshake Chocolat Oreo',  '', 59, 9),
  ('Milkshake Pistache',       '', 69, 10),
  ('Sodas',                    'Boissons gazeuses', 28, 11),
  ('Red Bull',                 '', 45, 12),
  ('Energy Drink',             '', 30, 13),
  ('Power Horse',              '', 39, 14),
  ('Oulmès (33cl)',            '', 18, 15),
  ('Oulmès (75cl)',            '', 25, 16)
) as v(name, description, price, sort)
where c.name_fr = 'Mojitos, Milkshakes & Sodas';

-- ---------- 21. Thés / Teas ----------
insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.description, v.price, v.sort
from menu_categories c,
(values
  ('Tangier''s Tea', 'Thé tangérois', 22, 1),
  ('Black Tea',       'Thé noir', 22, 2),
  ('Turkish Tea',     'Thé turc', 15, 3),
  ('Chamomile Tea',   'Thé à la camomille', 28, 4),
  ('Jasmin Tea',      'Thé au jasmin', 30, 5),
  ('Red Fruit Tea',   'Thé aux fruits rouges', 32, 6),
  ('Iced Tea',        'Thé glacé', 35, 7)
) as v(name, description, price, sort)
where c.name_fr = 'Thés';

-- ---------- 22. Cafés / Coffees ----------
insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.description, v.price, v.sort
from menu_categories c,
(values
  ('Espresso',                    'Café Espresso', 20, 1),
  ('Americano',                   'Café américain', 24, 2),
  ('Double Espresso',             'Café Espresso double', 28, 3),
  ('Hot/Cold Milk',               'Lait chaud / froid', 18, 4),
  ('Latte',                       'Café Latte classique', 32, 5),
  ('Viennese Latte',              'Latte viennois', 38, 6),
  ('Cappuccino',                  'Cappuccino italien', 32, 7),
  ('Viennese Cappuccino',         'Cappuccino viennois', 38, 8),
  ('Iced Coffee',                 'Café glacé', 39, 9),
  ('Hot Chocolate',               'Chocolat chaud', 30, 10),
  ('Melted Chocolate',            'Chocolat fondu', 40, 11),
  ('Dolce Espresso Caramelo',     '', 30, 12),
  ('Dolce Espresso Nutellino',    '', 34, 13),
  ('Dolce Espresso Chocolat & Noisette', '', 32, 14),
  ('Dolce Latte Caramelo',        '', 45, 15),
  ('Dolce Latte Chocolat & Noisette', '', 45, 16),
  ('Dolce Latte Nutellino',       '', 49, 17),
  ('Turkish Coffee',              'Café turc', 25, 18),
  ('Frappuccino Chocolat',        '', 39, 19),
  ('Frappuccino Noisette',        '', 42, 20),
  ('Frappuccino Caramel',         '', 42, 21),
  ('Frappuccino Vanille',         '', 42, 22)
) as v(name, description, price, sort)
where c.name_fr = 'Cafés';

-- ---------- 23. Petit-déjeuner à la carte ----------
insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.description, v.price, v.sort
from menu_categories c,
(values
  ('Pain au Chocolat',       '', 12, 1),
  ('Croissant Simple',       '', 12, 2),
  ('Croissant au Nutella',   '', 16, 3),
  ('Panier de Pain Maison',  'Servi avec beurre, confiture, miel, fromage blanc', 30, 4),
  ('Baghrir au Miel',        '', 28, 5),
  ('Baghrir Amlou & Banane', 'Avec amlou, miel, banane, fruits secs', 39, 6),
  ('Harcha au Miel et Fromage', '', 28, 7),
  ('Harcha Amlou ou Nutella', 'Avec amlou ou chocolat Nutella', 36, 8),
  ('Rghayef au Miel et Beurre', '', 28, 9),
  ('Rghayef au Miel et Amlou', '', 36, 10),
  ('Confiture (Extra)',      '', 6, 11),
  ('Amlou (Extra)',          '', 12, 12),
  ('Miel (Extra)',           '', 8, 13),
  ('Nutella (Extra)',        '', 12, 14),
  ('Jben Beldi (Extra)',     '', 12, 15),
  ('Fromage Édam (Extra)',   '', 14, 16),
  ('Dinde Fumée (Extra)',    '', 16, 17),
  ('Pastrami de Bœuf (Extra)', '', 25, 18),
  ('Avocat Guacamole (Extra)', '', 20, 19),
  ('Thon (Extra)',           '', 25, 20),
  ('Saumon Fumé (Extra)',    '', 45, 21),
  ('Tartine Guacamole & Poulet', '', 69, 22),
  ('Tartine Guacamole & Crevettes', '', 89, 23),
  ('Tartine Guacamole & Pastrami de Bœuf', 'Avec œuf', 69, 24),
  ('Tartine Brie & Noix',    '', 59, 25),
  ('Tartine au Thon',        '', 59, 26),
  ('Tartine Guacamole & Saumon Fumé', 'Avec œuf', 79, 27),
  ('Tartine Hummus Betteraves', 'Avec œuf Bénédicte', 49, 28),
  ('Toast Fromage',          '', 18, 29),
  ('Toast Fromage Dinde Fumée', '', 28, 30),
  ('Toast Fromage Pastrami de Bœuf', '', 34, 31),
  ('Toast Beymen',           'Fromage, dinde fumée, pastrami de bœuf', 42, 32),
  ('Croissant Dinde Fumée & Fromage', 'Avec œuf', 39, 33),
  ('Croissant Pastrami de Bœuf & Fromage', 'Avec œuf', 49, 34),
  ('Croissant Crevettes & Avocat', 'Avec œuf', 69, 35),
  ('Croissant Saumon Fumé & Épinards', 'Avec œuf', 72, 36)
) as v(name, description, price, sort)
where c.name_fr = 'Petit-déjeuner à la carte';

-- ---------- 24. Petit-déjeuner Cuisiné ----------
insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.description, v.price, v.sort
from menu_categories c,
(values
  ('Tajine au Khlii (2 œufs)', '', 42, 1),
  ('Tajine au Khlii (3 œufs)', '', 55, 2),
  ('Omelette Nature',          '', 28, 3),
  ('Omelette au Fromage',      '', 34, 4),
  ('Omelette Dinde et Fromage','', 38, 5),
  ('Omelette aux Légumes',     '', 42, 6),
  ('Omelette Champignons et Fromage', '', 42, 7),
  ('Omelette Pastrami de Bœuf et Fromage', '', 52, 8),
  ('Omelette au Saumon Fumé',  '', 69, 9),
  ('Œuf au Choix',             'Dur, brouillé ou au plat', 14, 10),
  ('2 Œufs au Choix',          'Dur, brouillé ou au plat', 26, 11),
  ('Croque au Fromage',        '', 28, 12),
  ('Croque Fromage et Dinde Fumée', '', 38, 13),
  ('Croque Madame',            '', 38, 14),
  ('Croque Fromage et Pastrami de Bœuf', '', 49, 15),
  ('Croque Pastrami de Bœuf et Épinards', '', 52, 16),
  ('Croque Saumon Fumé et Épinards', '', 59, 17),
  ('Pain Perdu Nature ou Sucre', '', 18, 18),
  ('Pain Perdu Topping au Choix', 'Caramel, noisette ou chocolat', 28, 19),
  ('Pain Perdu au Nutella',    '', 36, 20),
  ('Pain Perdu Nutella et Banane', '', 42, 21),
  ('Pain Perdu Beymen Tropical', 'Nutella, fruits de saison, coulis de fraise', 52, 22),
  ('Pain Perdu Maison',        'Nutella, amandes, boule de glace vanille', 59, 23),
  ('TAVA Normal',              'Oignon, tomate, œuf', 34, 24),
  ('TAVA Dinde Fumée',         '', 42, 25),
  ('TAVA Pastrami de Bœuf',    '', 54, 26),
  ('TAVA Saumon et Avocat',    'Tomate, fromage à la crème, œuf', 69, 27),
  ('TAVA Egg Sucuk',           'Sausage — Saucisse', 69, 28)
) as v(name, description, price, sort)
where c.name_fr = 'Petit-déjeuner Cuisiné';

-- ---------- 25. Formules Petit-déjeuner ----------
insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, v.description, v.price, v.sort
from menu_categories c,
(values
  ('Menemen Lovers',           'Scrambled eggs with peppers and tomatoes, marinated olives, vegetable salads, cacik, orange juice, mineral water, turkish tea', 52, 1),
  ('Beymen Kahvalti (1 pers)', 'Assortment of cheese, marinated olives, raw salad, turkey ham, salami, dried fruits, jam, honey, butter, Nutella, tahina, fried egg, hard-boiled egg, baked potato, simit bread, turkish chocolate brioche, fruit salad, orange juice, mineral water, turkish tea', 79, 2),
  ('Beymen Kahvalti (2 pers)', 'Same as 1 pers, doubled — Assortiment identique pour 2 personnes', 169, 3),
  ('Petit Déjeuner Express',   'Hot drink, mineral water, orange or carrot juice, trio of mini viennoiseries or bread basket with butter, jam, olives, jben beldi', 69, 4),
  ('Petit Déjeuner Continental', 'Hot drink, mineral water, orange or carrot juice, trio of mini viennoiseries, bread basket, butter, jam, olives, jben beldi, egg of choice', 85, 5),
  ('Petit Déjeuner Diet',      'Hot drink, mineral water, orange or carrot juice, bowl of granola with red fruits and orange blossom milk, fruit salad', 95, 6),
  ('Petit Déjeuner Espagnol',  'Hot drink, mineral water, orange or carrot juice, grilled bread or toast, tomato, olive oil pesto, manchego cheese, fruit salad', 69, 7),
  ('Petit Déjeuner Marocain',  'Hot drink, mineral water, bread basket, msemmen, harcha, baghrir with honey and amlou, plain cheese, fruit salad', 110, 8),
  ('Petit Déjeuner Tangérois', 'Hot drink, mineral water, 2 fried eggs, bread, olive oil, olives, jben beldi, fruit salad', 59, 9),
  ('Eggs Benedict Saumon Fumé','Eggs benedict with smoked salmon', 79, 10),
  ('Petit Déjeuner Norvégien', 'Hot drink, mineral water, orange or carrot juice, black toast, smoked salmon guacamole or greek sauce, herbed cream cheese, 2 fried eggs, fruit salad', 125, 11),
  ('Petit Déjeuner Français',  'Hot drink, mineral water, orange or carrot juice, omelette of choice, pistolet bread, croissant, olives, fruit salad', 119, 12),
  ('Petit Déjeuner Hollandais','Hot drink, mineral water, orange or carrot juice, 2 toasts with edam cheese and smoked turkey or beef pastrami (+25dh), 2 fried eggs, fruit salad', 115, 13),
  ('Brunch Beymen',            'Hot drink, mineral water, orange or carrot juice, trio of mini viennoiseries, bread basket, butter, jam, olives, egg of choice, edam cheese, charcuterie, jben beldi, beef sausages, roasted potatoes, fruit salad', 149, 14)
) as v(name, description, price, sort)
where c.name_fr = 'Formules Petit-déjeuner';
