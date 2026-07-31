-- ============================================================
-- Beymen POS — July 2026 fixes, part 2. Run once in Supabase SQL Editor
-- (after session_lock.sql and fixes_2026_07.sql).
--
-- 1. Cashiers log in with a 4-digit PIN on the pad, same as waiters.
-- 2. Menu categories reordered: breakfast first, then Extras Sweet, then
--    the food, Extras before the sweets, desserts + drinks last.
-- 3. Two new categories with their items: Extras and Extras Sweet.
-- ============================================================
set search_path = public, extensions;

-- ---------- 1. PIN login for cashiers ----------
-- Same body as session_lock.sql, with the PIN-only restriction widened
-- from waiter to waiter+cashier (admin still needs username+password).
create or replace function staff_login(p_username text, p_secret text)
returns table (
  id uuid, name text, username text, role text, color text,
  session_token text, denied boolean
)
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_staff staff%rowtype;
  v_busy boolean;
  v_token text;
begin
  select * into v_staff
  from staff s
  where s.active
    and (p_username = '' or s.username = p_username)
    and s.secret_hash = crypt(p_secret, s.secret_hash)
    and (p_username <> '' or s.role in ('waiter', 'cashier'))
  limit 1;

  if not found then
    return; -- bad credentials: empty result set
  end if;

  v_busy := v_staff.session_last_seen is not null
    and now() - v_staff.session_last_seen < interval '25 seconds';

  if v_busy then
    return query
      select v_staff.id, v_staff.name, v_staff.username, v_staff.role, v_staff.color,
             null::text, true;
    return;
  end if;

  v_token := encode(gen_random_bytes(16), 'hex');
  update staff set session_token = v_token, session_last_seen = now() where staff.id = v_staff.id;

  return query
    select v_staff.id, v_staff.name, v_staff.username, v_staff.role, v_staff.color,
           v_token, false;
end $$;

-- ---------- 2. category order ----------
-- Breakfast first, Extras Sweet right after breakfast (sort 4), the food,
-- Extras just before the sweets/drinks block (sort 20), desserts + drinks
-- at the end.
update menu_categories set sort = v.s
from (values
  ('Petit-déjeuner à la carte',    1),
  ('Petit-déjeuner Cuisiné',       2),
  ('Formules Petit-déjeuner',      3),
  -- Extras Sweet -> 4 (inserted below)
  ('Soupes',                       5),
  ('Salades',                      6),
  ('Entrées Froides',              7),
  ('Entrées Chaudes',              8),
  ('Entrées Steakhouse',           9),
  ('Plats Mijotés',                10),
  ('Pide',                         11),
  ('Poissons',                     12),
  ('Fast Food',                    13),
  ('Burgers Steakhouse',           14),
  ('Grillades',                    15),
  ('Durum',                        16),
  ('Rôtis',                        17),
  ('Steaks',                       18),
  ('Golden Steaks',                19),
  -- Extras -> 20 (inserted below)
  ('Sucreries Traditionnelles',    21),
  ('Sucreries Gourmandes',         22),
  ('Jus & Smoothies',              23),
  ('Mocktails',                    24),
  ('Mojitos, Milkshakes & Sodas',  25),
  ('Thés',                         26),
  ('Cafés',                        27)
) as v(n, s)
where name_fr = v.n;

-- ---------- 3. new categories + items ----------
insert into menu_categories (name_fr, name_en, sort)
select 'Extras Sweet', 'Extras Sweet', 4
where not exists (select 1 from menu_categories where name_fr = 'Extras Sweet');

insert into menu_categories (name_fr, name_en, sort)
select 'Extras', 'Extras', 20
where not exists (select 1 from menu_categories where name_fr = 'Extras');

-- idempotence: rebuild the two categories' items on re-run
delete from menu_items
where category_id in (select id from menu_categories where name_fr in ('Extras', 'Extras Sweet'));

insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, '', v.price, v.sort
from menu_categories c,
(values
  ('Extra Sirop',              6,  1),
  ('Extra Pastrami',           30, 2),
  ('Extra Avocat Guacamole',   20, 3),
  ('Granola Offert',           0,  4),
  ('Extra Riz',                15, 5),
  ('Extra Frite',              20, 6),
  ('Extra Charcutrie',         10, 7),
  ('Extra Smith',              10, 8),
  ('Extra Sojouk',             20, 9),
  ('Extra Brioche',            10, 10),
  ('Extra Crevette',           59, 11),
  ('Extra Tortilla',           10, 12),
  ('Extra V.Hachée',           45, 13),
  ('Extra Sauce Champignons',  10, 14),
  ('Extra Pomme Four',         20, 15),
  ('Extra Fromage',            15, 16),
  ('Extra Poulet Pané',        45, 17),
  ('Extra Légumes Sautés',     25, 18),
  ('Extra Borghol',            15, 19)
) as v(name, price, sort)
where c.name_fr = 'Extras';

insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, '', v.price, v.sort
from menu_categories c,
(values
  ('Confiture',          6,  1),
  ('Amlou',              12, 2),
  ('Miel',               8,  3),
  ('Nutella',            12, 4),
  ('Jben Beldi',         12, 5),
  ('Fromage Edam',       12, 6),
  ('Dinde Fumé',         16, 7),
  ('Pastrami Boeuf',     25, 8),
  ('Avocat Guacamole',   20, 9),
  ('Thon',               25, 10),
  ('Saumon Fumé',        45, 11),
  ('Extra Beurre',       8,  12)
) as v(name, price, sort)
where c.name_fr = 'Extras Sweet';
