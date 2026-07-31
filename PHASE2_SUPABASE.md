# Phase 2 — Acua's own Supabase project (manual steps)

Acua gets a **brand-new, fully isolated** Supabase project. Nothing here
touches Beymen's database.

## 1. Create the project (Supabase dashboard)
1. Go to https://supabase.com/dashboard → **New project**.
2. **Name:** `acua-pos` (or `acua-production`).
3. **Region:** **EU (West) — `eu-west-3` Paris** or **`eu-west-1` Ireland**.
   Either is low-latency for Spain; Paris is closest.
4. **Database password:** generate a strong one and store it in your password
   manager (you won't need it for the app, only for direct DB access).
5. Create, and wait ~2 min for it to finish provisioning.

## 2. Grab the keys
Project → **Settings → API**:
- **Project URL** → `https://xxxx.supabase.co`
- **anon public** key → goes in the app `.env` (safe for the browser)
- **service_role** key → **NEVER** in the app `.env` or any client bundle.
  You'll only need it later (Phase 3) as a Supabase **secret**, not in code.

Give me the **URL** and **anon key** and I'll set `.env`. (Do **not** paste the
service_role key into chat — keep it in the dashboard.)

`.env` ends up as:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
```
Only `VITE_*` vars reach the browser — the service_role key stays out.

## 3. Run the schema
Project → **SQL Editor → New query** → paste the **entire**
[`supabase/acua_schema.sql`](supabase/acua_schema.sql) → **Run**.

This creates every table (`staff`, `restaurant_tables`, `table_sessions`,
`order_items`, `payments`, `menu_categories`, `menu_items`, `menu_stock`,
`friends`, `friend_debts`, `activity_log`, `report_requests`,
`push_subscriptions`), all auth/admin RPCs, RLS policies, the realtime
publication, default staff, a starter floor plan, and 4 empty placeholder
menu categories (no items — the client's real menu goes in later).

It is idempotent — safe to re-run if a step half-finished.

## 4. Verify RLS
Project → **Authentication → Policies** (or **Database → Tables**). Confirm:
- Every operational table shows **RLS enabled** with an `anon_all` policy
  (menu tables are read-only to anon: `anon_read`).
- `staff` has **RLS enabled with NO anon policy** — the anon key can never read
  password hashes; logins go only through the `staff_login` RPC, and the app
  reads staff through the `staff_public` view (no secrets).

## 5. Change the default credentials
The seed ships demo logins — change them before real use:
- Admin: `admin` / `admin1234`
- Cashier: `caisse` / `caisse123`
- Waiters: `serveur1` PIN `1111`, `serveur2` PIN `2222`

Log in as admin → **Staff** tab → edit each one's PIN/password.

## Done when
The app (`npm run dev`) loads against the new URL, you can log in with the
seeded admin, the floor map shows the starter tables, and the menu tabs are
present but empty — all with **zero** Beymen data visible.
