# Acua POS

Point-of-sale / floor-management system for **Acua** — Café · Restaurant ·
Lounge (single location, Spain). Forked and rebranded from the Beymen POS
codebase; multi-branch logic has been collapsed to a single location and the
menu ships empty pending the client's real data.

- **Stack:** React 19 + TypeScript, Vite, Tailwind v4, Zustand, Supabase
  (Postgres + Realtime + RLS), Tauri (desktop till / kitchen-print), Android
  wrapper.
- **Interfaces:** Waiter (mobile), Cashier/Caisse (desktop), Admin
  (responsive), Kitchen print station (unattended).
- Each restaurant is fully standalone with its **own** analytics — there is no
  cross-restaurant / shared-analytics feature.

## Getting started

```bash
npm install
npm run dev
```

Set the Supabase connection in `.env` (see `.env.example`):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

> Only the **anon** key belongs in the client `.env`. The service-role key must
> never be shipped in any client bundle.

## Full spec

See [`PROJECT_SPEC.md`](PROJECT_SPEC.md).

---

## Supabase project setup (one-time)

Acua runs on its **own, fully isolated** Supabase project.

### 1. Create the project (dashboard)
1. https://supabase.com/dashboard → **New project**.
2. **Name:** `acua-pos`.
3. **Region:** EU (West) — `eu-west-3` Paris or `eu-west-1` Ireland (low-latency
   for Spain).
4. **Database password:** generate a strong one and keep it in a password
   manager (only needed for direct DB access, not the app).

### 2. Keys
Project → **Settings → API**:
- **Project URL** → `VITE_SUPABASE_URL` in `.env`.
- **anon public** key → `VITE_SUPABASE_ANON_KEY` in `.env` (safe for the browser).
- **service_role** key → **NEVER** in `.env` or any client bundle. Not needed
  for normal operation.

Only `VITE_*` vars reach the browser.

### 3. Run the schema
Project → **SQL Editor → New query** → paste the entire
[`supabase/acua_schema.sql`](supabase/acua_schema.sql) → **Run**.

Creates every table (`staff`, `restaurant_tables`, `table_sessions`,
`order_items`, `payments`, `menu_categories`, `menu_items`, `menu_stock`,
`friends`, `friend_debts`, `activity_log`, `report_requests`,
`push_subscriptions`), all auth/admin RPCs, RLS policies, the realtime
publication, default staff, a starter floor plan, and 4 empty placeholder menu
categories (no items — the real menu goes in later). Idempotent — safe to
re-run.

### 4. Verify RLS
Project → **Database → Policies**. Confirm:
- Operational tables show **RLS enabled** with an `anon_all` policy (menu tables
  are read-only to anon: `anon_read`).
- `staff` has **RLS enabled with NO anon policy** — the anon key can never read
  password hashes; logins go only through the `staff_login` RPC, and the app
  reads staff through the `staff_public` view.

### 5. Change the default credentials
Seed logins (change before real use, admin → **Staff** tab):
- Admin: `admin` / `admin1234`
- Cashier: `caisse` / `caisse123`
- Waiters: `serveur1` PIN `1111`, `serveur2` PIN `2222`

**Done when** the app loads against the project, you can log in as admin, the
floor map shows the starter tables, and the menu tabs are present but empty.

---

## Branding status

The **ACUA logo** (teal wordmark + pink "CAFÉ · RESTAURANT · LOUNGE" tagline,
pale-blue field) is applied everywhere, recreated as vector art in
[`branding/acua-logo.svg`](branding/acua-logo.svg).

### ✅ Done — logo applied
| Asset | Status |
|---|---|
| `public/favicon.svg` | ✅ ACUA wordmark |
| `public/icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | ✅ regenerated from logo |
| `src/components/AcuaLogo.tsx` | ✅ inline logo in Login (with tagline) + TopBar |
| `src/lib/receiptLogo.ts` | ✅ regenerated 1-bit thermal raster + PNG (`branding/gen-receipt-logo.cjs`) |
| `src-tauri/icons/*`, Android `mipmap-*`, iOS `AppIcon-*` | ✅ regenerated via `tauri icon` |
| Tagline / app name | ✅ `ACUA` · `CAFÉ · RESTAURANT · LOUNGE` |
| Theme | ✅ white / light pink / light blue (`src/index.css`) |

> The logo is a faithful **vector recreation**. To swap in original high-res
> artwork, drop it in and re-run `rsvg-convert` / `tauri icon` /
> `node branding/gen-receipt-logo.cjs`.

### ⏳ Still placeholder (search `TODO(client)`)
- **Receipt footer** — `src/lib/print.ts` `FOOTER`: website/socials/tax-no/address
  are placeholders (`WWW.ACUA.ES`, etc.).
- **Web Push** — `src/lib/push.ts` still ships Beymen's VAPID public key and a
  placeholder notify URL. Generate a fresh keypair
  (`npx web-push generate-vapid-keys`), deploy Acua's own `api/notify.js`, and
  set the private key in that function's env.
- **Deployed URLs** — Tauri (`tauri.conf.json`, `capabilities/default.json`) and
  Android (`MainActivity.java`) load `https://acua-pos.vercel.app` — repoint
  once Acua is deployed.
