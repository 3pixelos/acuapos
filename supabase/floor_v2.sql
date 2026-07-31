-- ============================================================
-- Beymen POS — floor plan v2 (3 layers) + lock + per-unit payment.
-- Run once in Supabase SQL Editor. Best run when no tables are open.
-- ============================================================

-- new columns
alter table restaurant_tables add column if not exists layer text;
alter table restaurant_tables add column if not exists sort int not null default 0;
alter table restaurant_tables add column if not exists vip boolean not null default false;
alter table table_sessions add column if not exists locked boolean not null default false;
-- how many units of a line have been paid for (per-unit payment at the till)
alter table order_items add column if not exists paid_qty int not null default 0;

-- rebuild the floor
delete from restaurant_tables;

-- Terrasse — 16 tables (T1..T16)
insert into restaurant_tables (id, label, seats, zone, layer, sort, x, y)
select 'TER-' || g, 'T' || g, 4, 'Terrasse', 'terrasse', g, 0, 0
from generate_series(1, 16) g;

-- Salon — 22 tables (S1..S22) + one big VIP table
insert into restaurant_tables (id, label, seats, zone, layer, sort, x, y)
select 'SAL-' || g, 'S' || g, 4, 'Salon', 'salon', g, 0, 0
from generate_series(1, 22) g;
insert into restaurant_tables (id, label, seats, zone, layer, sort, vip, x, y)
values ('SAL-VIP', 'Salon VIP', 20, 'Salon', 'salon', 999, true, 0, 0);

-- Étage 2 — 19 tables (E1..E19)
insert into restaurant_tables (id, label, seats, zone, layer, sort, x, y)
select 'E2-' || g, 'E' || g, 4, 'Étage 2', 'etage2', g, 0, 0
from generate_series(1, 19) g;
