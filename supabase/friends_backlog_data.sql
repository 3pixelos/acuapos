-- ============================================================
-- Beymen POS — backlog of friends' tabs from old paper receipts.
-- Run once in the Supabase SQL Editor. Idempotent (skips rows already
-- inserted with the same friend + month + amount).
--
-- Backlog rows are month-only, so each is stored on the 1st of its month
-- with backlog = true; the itemised receipt goes in `note`.
-- Saoudi's 67 MAD July tab is already paid back -> inserted settled.
-- ============================================================
set search_path = public, extensions;

do $$
declare
  r record;
begin
  for r in
    select * from (values
      -- friend,    month,        amount, settled, note
      ('Mehdi',   '2025-10-01'::date, 1373, false,
       'Asado Burger x1, Bon file (lokum) x1, Carotte x1, Cheese burger x1, Drinks sodas x2, Espresso lavaza x1, Extra frite x1, Grecque Salata x1, Havuc Dilimi x1, Kunafa x1, Oulmes small x2, San Sebastian x1, Sezar Salad x2, Tavuk gogsu x1'),

      ('Saoudi',  '2026-07-01'::date,   67, true,
       'MerciMek corbasi x1, Espresso x1'),

      ('Saoudi',  '2026-07-01'::date,  836, false,
       'Adana Durum x2, MerciMek Corbasi x1, Mango Juice x1, Avocado juice with dried Pineapple x1, Pineapple x1, Etli Ekmek x1, Humuz x1, Trilece x1, Tavuk Sezar Salata x1'),

      ('Hamza',   '2026-07-01'::date,   78, false,
       'Omelette champignons fromage x1, Chamomile tea x1, Extra smith x1'),

      ('Mehdi',   '2026-07-01'::date,  938, false,
       'Mix Meze x1, Beymen Tepsi x1, Eau Mineral x1, Sodas x1, Virgin Mojito classic x1, Trilece x2'),

      ('Mehdi',   '2025-12-01'::date,  613, false,
       'Sodas x1, Mevlana x1, Trilece x1, Tavuk SIS x2, Tavuk sote x1'),

      ('Hicham',  '2026-07-01'::date,  767, false,
       'Mix Meze x1, Beymen Burger x1, Cheese Burger x2, Oulmes 75cl x1, Eau Mineral 1L x1, Apple x1, Pineapple juice x1, Trilece x1')
    ) as v(friend_name, incurred_on, amount, settled, note)
  loop
    -- the friend must exist (friends_2026_07.sql seeds these five names)
    if not exists (select 1 from friends f where f.name = r.friend_name) then
      insert into friends (name, sort)
      values (r.friend_name, (select coalesce(max(sort), 0) + 1 from friends));
    end if;

    -- skip if this exact backlog row is already in
    if not exists (
      select 1 from friend_debts d
      join friends f on f.id = d.friend_id
      where f.name = r.friend_name
        and d.incurred_on = r.incurred_on
        and d.amount = r.amount
        and d.backlog
    ) then
      insert into friend_debts (friend_id, amount, method, incurred_on, backlog, note, settled, settled_at)
      values (
        (select id from friends f where f.name = r.friend_name limit 1),
        r.amount, 'cash', r.incurred_on, true, r.note, r.settled,
        case when r.settled then now() else null end
      );
    end if;
  end loop;
end $$;
