# Acua POS

Point-of-sale / floor-management system for **Acua** (single location, Spain).
Forked and rebranded from the Beymen POS codebase; multi-branch logic has been
collapsed to a single location and the menu ships empty pending the client's
real data.

- **Stack:** React 19 + TypeScript, Vite, Tailwind v4, Zustand, Supabase
  (Postgres + Realtime + RLS), Tauri (desktop till / kitchen-print), Android
  wrapper.
- **Interfaces:** Waiter (mobile), Cashier/Caisse (desktop), Admin
  (responsive), Kitchen print station (unattended).

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

## Branding / setup still needed

See [`BRANDING_TODO.md`](BRANDING_TODO.md) — the icons, receipt logo, tagline,
receipt footer and push/VAPID config are still placeholders awaiting real Acua
assets. Search the code for `TODO(client)` to find each spot.

## Full spec

See [`PROJECT_SPEC.md`](PROJECT_SPEC.md).
