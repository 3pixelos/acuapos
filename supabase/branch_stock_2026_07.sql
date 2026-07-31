-- ============================================================
-- Beymen POS — PER-BRANCH stock (availability).
--
-- The menu itself (items, prices, categories) stays shared: one brand, one
-- price list. What is NOT shared is whether a given item is in stock —
-- Iberia can run out of ribeye while Playa still has some.
--
-- Model: `menu_stock` holds one row per (item, branch). A MISSING row means
-- available, so creating a new menu item makes it sellable at both branches
-- immediately without a backfill. `menu_items.available` stays as the seed
-- for this table and is no longer read by the app.
--
-- Run AFTER branches_2026_07.sql. Safe to re-run.
-- ============================================================

create table if not exists menu_stock (
  menu_item_id uuid not null references menu_items (id) on delete cascade,
  branch       text not null check (branch in ('iberia', 'playa')),
  available    boolean not null default true,
  updated_at   timestamptz not null default now(),
  primary key (menu_item_id, branch)
);

create index if not exists idx_menu_stock_branch on menu_stock (branch) where not available;

-- Seed both branches from the old global flag, so nothing that is currently
-- marked out-of-stock silently comes back on sale.
insert into menu_stock (menu_item_id, branch, available)
select m.id, b.branch, coalesce(m.available, true)
from menu_items m
cross join (values ('iberia'), ('playa')) as b(branch)
on conflict (menu_item_id, branch) do nothing;

alter table menu_stock enable row level security;
do $$
begin
  create policy anon_all on menu_stock for all to anon using (true) with check (true);
exception when duplicate_object then null; end $$;

-- The tills must see a stock flip immediately, not on the next 20s poll.
do $$
begin
  alter publication supabase_realtime add table menu_stock;
exception when duplicate_object then null; end $$;
