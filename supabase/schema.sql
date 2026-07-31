-- ============================================================
-- Beymen POS — schema. Run once in Supabase SQL Editor.
-- ============================================================
create extension if not exists pgcrypto with schema extensions;
set search_path = public, extensions;

-- ---------- staff ----------
create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  username text not null unique,
  role text not null check (role in ('waiter', 'cashier', 'admin')),
  secret_hash text not null, -- PIN (waiters) or password (cashier/admin), bcrypt
  color text not null default '#78716C',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- fixed floor plan ----------
create table if not exists restaurant_tables (
  id text primary key,           -- 'T1', 'B3'...
  label text not null,
  seats int not null,
  zone text not null,
  x numeric not null,            -- % position on map
  y numeric not null
);

-- ---------- live sessions ----------
create table if not exists table_sessions (
  id uuid primary key default gen_random_uuid(),
  table_ids text[] not null,
  waiter_id uuid not null references staff(id),
  covers int not null,
  status text not null default 'waiting' check (status in ('waiting', 'preparing', 'served')),
  seated_at timestamptz not null default now(),
  first_ticket_at timestamptz,
  served_at timestamptz,
  closed_at timestamptz,          -- set on full payment or cancellation
  cancelled boolean not null default false,
  cancel_reason text,
  ticket_seq int not null default 0
);
create index if not exists idx_sessions_open on table_sessions (closed_at) where closed_at is null;

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references table_sessions(id) on delete cascade,
  menu_item_id uuid,
  name text not null,
  price numeric not null,
  qty int not null default 1,
  note text not null default '',
  category text not null default '',
  ticket_no int,                 -- null = in cart, not yet sent to kitchen
  voided boolean not null default false,
  void_reason text,
  payment_id uuid,               -- set when covered by a per-item payment
  created_at timestamptz not null default now()
);
create index if not exists idx_items_session on order_items (session_id);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references table_sessions(id) on delete cascade,
  cashier_id uuid references staff(id),
  method text not null check (method in ('cash', 'card')),
  amount numeric not null,
  kind text not null default 'full' check (kind in ('full', 'equal', 'items')),
  created_at timestamptz not null default now()
);

-- ---------- menu (developer-managed) ----------
create table if not exists menu_categories (
  id uuid primary key default gen_random_uuid(),
  name_fr text not null,
  name_en text not null,
  sort int not null default 0
);

create table if not exists menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references menu_categories(id) on delete cascade,
  name text not null,
  description text not null default '',
  price numeric not null,
  available boolean not null default true,
  sort int not null default 0
);

-- ---------- audit ----------
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff(id),
  action text not null,
  table_ref text not null default '',
  detail jsonb not null default '{}',
  at timestamptz not null default now()
);

-- ============================================================
-- Auth RPC: verifies PIN/password, never exposes hashes.
-- ============================================================
create or replace function staff_login(p_username text, p_secret text)
returns table (id uuid, name text, username text, role text, color text)
language plpgsql security definer set search_path = public, extensions as $$
begin
  return query
    select s.id, s.name, s.username, s.role, s.color
    from staff s
    where s.active
      and (p_username = '' or s.username = p_username)
      and s.secret_hash = crypt(p_secret, s.secret_hash)
      and (p_username <> '' or s.role = 'waiter'); -- PIN-only login limited to waiters
end $$;

create or replace function staff_set_secret(p_staff_id uuid, p_secret text)
returns void language sql security definer set search_path = public, extensions as $$
  update staff set secret_hash = crypt(p_secret, gen_salt('bf')) where id = p_staff_id;
$$;

create or replace function staff_create(
  p_name text, p_username text, p_role text, p_secret text, p_color text
) returns uuid language sql security definer set search_path = public, extensions as $$
  insert into staff (name, username, role, secret_hash, color)
  values (p_name, p_username, p_role, crypt(p_secret, gen_salt('bf')), p_color)
  returning id;
$$;

-- ============================================================
-- RLS: app uses anon key on trusted restaurant devices.
-- staff table locked down (no direct read of hashes); rest open to anon.
-- ============================================================
alter table staff enable row level security;
alter table restaurant_tables enable row level security;
alter table table_sessions enable row level security;
alter table order_items enable row level security;
alter table payments enable row level security;
alter table menu_categories enable row level security;
alter table menu_items enable row level security;
alter table activity_log enable row level security;

-- staff: no anon policies -> only via RPCs and the safe view below
create or replace view staff_public
  with (security_invoker = off) as
  select id, name, username, role, color, active from staff;
grant select on staff_public to anon;

create policy anon_all on restaurant_tables for all to anon using (true) with check (true);
create policy anon_all on table_sessions for all to anon using (true) with check (true);
create policy anon_all on order_items for all to anon using (true) with check (true);
create policy anon_all on payments for all to anon using (true) with check (true);
create policy anon_read on menu_categories for select to anon using (true);
create policy anon_read on menu_items for select to anon using (true);
create policy anon_all on activity_log for all to anon using (true) with check (true);

-- Realtime
alter publication supabase_realtime add table table_sessions, order_items, payments, staff;

-- ============================================================
-- Seed: floor plan, staff, temporary menu
-- ============================================================
insert into restaurant_tables (id, label, seats, zone, x, y) values
  ('T1', 'T1', 2, 'Salle', 14, 16), ('T2', 'T2', 2, 'Salle', 38, 16),
  ('T3', 'T3', 4, 'Salle', 62, 16), ('T4', 'T4', 4, 'Salle', 86, 16),
  ('T5', 'T5', 6, 'Salle', 20, 42), ('T6', 'T6', 6, 'Salle', 50, 42),
  ('T7', 'T7', 2, 'Salle', 80, 42),
  ('B1', 'B1', 2, 'Terrasse', 14, 76), ('B2', 'B2', 2, 'Terrasse', 38, 76),
  ('B3', 'B3', 4, 'Terrasse', 62, 76), ('B4', 'B4', 8, 'Terrasse', 86, 76)
on conflict (id) do nothing;

insert into staff (name, username, role, secret_hash, color) values
  ('Admin',   'admin',   'admin',   crypt('admin1234', gen_salt('bf')), '#8B5CF6'),
  ('Caisse',  'caisse',  'cashier', crypt('caisse123', gen_salt('bf')), '#0EA5E9'),
  ('Yassine', 'yassine', 'waiter',  crypt('1111', gen_salt('bf')), '#F59E0B'),
  ('Salma',   'salma',   'waiter',  crypt('2222', gen_salt('bf')), '#EC4899'),
  ('Omar',    'omar',    'waiter',  crypt('3333', gen_salt('bf')), '#10B981')
on conflict (username) do nothing;

do $$
declare
  c_entrees uuid; c_plats uuid; c_desserts uuid; c_boissons uuid;
begin
  if exists (select 1 from menu_categories) then return; end if;
  insert into menu_categories (name_fr, name_en, sort) values ('Entrées', 'Starters', 1) returning id into c_entrees;
  insert into menu_categories (name_fr, name_en, sort) values ('Plats', 'Mains', 2) returning id into c_plats;
  insert into menu_categories (name_fr, name_en, sort) values ('Desserts', 'Desserts', 3) returning id into c_desserts;
  insert into menu_categories (name_fr, name_en, sort) values ('Boissons', 'Drinks', 4) returning id into c_boissons;

  insert into menu_items (category_id, name, description, price, sort) values
    (c_entrees, 'Harira', 'Soupe marocaine traditionnelle', 25, 1),
    (c_entrees, 'Salade Marocaine', 'Tomates, poivrons, oignons', 30, 2),
    (c_entrees, 'Briouates au fromage', 'Feuilletés croustillants', 45, 3),
    (c_plats, 'Tajine Poulet', 'Citron confit & olives', 75, 1),
    (c_plats, 'Tajine Kefta', 'Boulettes, œuf, tomate', 80, 2),
    (c_plats, 'Couscous Royal', 'Agneau, poulet, merguez', 110, 3),
    (c_plats, 'Grillade Mixte', 'Assortiment de viandes', 140, 4),
    (c_plats, 'Pastilla au Poulet', 'Sucré-salé, amandes', 120, 5),
    (c_desserts, 'Pâtisseries assorties', 'Corne de gazelle, chebakia', 40, 1),
    (c_desserts, 'Salade de fruits', 'Fruits de saison', 35, 2),
    (c_boissons, 'Thé à la menthe', 'Théière', 15, 1),
    (c_boissons, 'Jus d''orange frais', 'Pressé minute', 25, 2),
    (c_boissons, 'Eau minérale', '50cl', 10, 3),
    (c_boissons, 'Coca-Cola', '33cl', 15, 4);
end $$;
