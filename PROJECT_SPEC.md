# Acua POS — Restaurant Management System

> Forked from the Beymen POS codebase and rebranded for **Acua** (single
> location, Spain). Branch/multi-location logic has been collapsed to one
> location; the menu ships empty pending the client's real data.

**Type:** Working production application (not a marketing site) — a full point-of-sale / floor-management system used live, every service, on real devices in a restaurant. Needs to be priced as custom software, not a template site.

**Client:** Acua (Spain) — single-location restaurant. Menu content to be provided by the client (the schema and app logic are inherited unchanged from the Beymen build).

---

## 1. What it is

A restaurant floor + order + billing + analytics system with three distinct interfaces sharing one live database, plus a fourth unattended "device" (kitchen print station). One employee = one login = one interface, determined by role. All interfaces read/write the same real-time data, so a table's state (who's serving it, what's been ordered, whether it's late) is instantly visible everywhere.

- **Waiter** — mobile-first, used on personal phones on the floor
- **Cashier (Caisse)** — desktop, used at a fixed till
- **Admin** — responsive (phone + desktop), used by ownership/management
- **Kitchen print station** — a fixed unattended screen next to the kitchen printer; not logged into by a person, just left open

Bilingual throughout (French / English), with instant language switching.

## 2. Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + TypeScript, Vite build |
| Styling | Tailwind CSS v4 |
| State | Zustand (client), Supabase Postgres (source of truth) |
| Backend | Supabase (Postgres + Realtime + Row Level Security + Postgres RPC functions for auth) |
| Charts | Recharts (pie chart, bar chart, custom heat-grid) |
| Icons | Lucide |
| Auth | Custom — bcrypt-hashed PIN (waiters) or password (cashier/admin) via Postgres RPC, no third-party auth provider |
| Printing | Browser-native `window.print()` targeted at 80mm thermal receipt ratio; silent/no-dialog printing via a dedicated print-station device running Chrome with `--kiosk-printing` |
| Hosting target | Static SPA (any static host) + Supabase project |

No native mobile app — the waiter/admin mobile experience is a responsive web app (PWA-style), installed devices use a normal browser. This should be priced as a web app, not App Store native development, but the UX bar is "feels native": touch-optimized, 44px+ tap targets, instant transitions, works one-handed on a phone.

## 3. Data model (Supabase Postgres)

Core tables: `staff`, `restaurant_tables`, `table_sessions`, `order_items`, `payments`, `menu_categories`, `menu_items`, `activity_log`.

Key modeling decisions:
- A **table session** (not the table row itself) carries state: which table(s), which waiter, guest count, status, timestamps. Tables are just fixed floor-plan slots.
- **Joining tables** merges sessions (arbitrary N-way, not just pairs) — items, guest counts, and timestamps all merge into one session.
- **Order items** carry a `ticket_no` (null = still in cart, not sent) so the kitchen only ever sees what's actually been sent, and a `printed_at` flag so the kitchen print station never double-prints.
- **Payments** are logged per transaction (not just a running total) — each partial payment records its method, kind (full/equal-split/by-item), and which items it covered, so the admin audit trail can reconstruct exactly how a bill was settled.
- Full row-level security: anon key scoped per table, staff PINs/passwords never readable by the client (only via `SECURITY DEFINER` RPC functions that check credentials server-side).

## 4. Feature breakdown by interface

### 4.1 Login (shared, all roles)
- Single entry point, two modes: PIN pad (waiters, 4-digit) or username+password (cashier/admin)
- Role read from the database determines which interface loads — no manual role selection
- French/English toggle, persisted per device

### 4.2 Waiter interface (mobile-first)
- Live floor map: all tables, color-coded by status (free / waiting / preparing / served / **late**, auto-triggered at 30 min in "preparing"), each waiter's own tables visually highlighted
- Tap a free table → choose guest count (quick-pick buttons sized to the table's normal capacity, **plus a free-entry field with no upper limit** for oversized parties) → table seated
- **Long-press to multi-select any number of tables** and join them into one session (merges guest counts, keeps the earliest timestamps/most-advanced status) — works on already-active tables too, not just free ones
- Joined tables are connected on the floor map by a soft dashed line that **changes color live with the table's status**
- Order screen: category tabs, tap-to-add items (repeat taps increment quantity on the same line, never duplicate rows), per-item quantity and free-text notes, running total
- Send to kitchen → items lock in as a numbered ticket; **no print dialog appears on the waiter's phone** — printing happens automatically at the dedicated kitchen station
- Add more items after the first send → new items print as a supplemental ticket at the kitchen, but join the same running bill
- Mark table served (manual trigger — the only status change waiters set directly)
- Void a sent item or cancel/free a whole table, both require a typed reason, both logged to the admin audit trail
- Any waiter can see all tables/statuses/owners and step in on a colleague's table (explicit take-over confirmation, no accidental edits)

### 4.3 Cashier / Caisse interface (desktop)
- Read-only floor map (can view status/orders, cannot edit orders or change status)
- Click a served table → itemized bill
- Three payment paths:
  1. **Full payment** — one tap, cash or card
  2. **Split equally** — N-way split where N ranges from 2 up to the table's actual guest count; paying one share correctly reduces what's left to split, it does not re-split the original total (fixed a real bug here — this was looping incorrectly)
  3. **Pay by specific item** — select any subset of unpaid items, see running paid/remaining, repeat until settled
- Print bill (receipt-ratio, not a full page)
- Table auto-frees the instant the balance reaches zero, however it got there

### 4.4 Admin interface (responsive — phone + desktop)
- Live read-only floor map
- **Analytics tab**: revenue, order count, average ticket, tables occupied; date range as day / week / specific day / specific month **(dropdown of the last 24 months, not a native date input)** / rolling week; revenue-over-time bar chart; best-sellers **pie chart by quantity** with an accessible ranked list beside it; busiest-hours heat grid (day × hour); per-waiter service-time and revenue stats
- **Orders tab**: every closed bill for the selected period, expandable to show line items, how it was paid (full / split-equally / by-item, with method), and a one-tap "view/print bill" action
- **Staff tab**: add/edit/deactivate employees, set role and PIN/password; **colors are assigned automatically and guaranteed distinct — admin does not pick them**, and only waiters get a color at all (cashier/admin are neutral, since the color exists solely to identify which waiter owns a table on the map)
- **Journal tab** (full audit trail): filterable by **All / Waiters / Caisse** and by a specific date; every action is logged (seat, join, send-to-kitchen, served, take-over, void-with-reason, cancel-with-reason, payment-with-method-and-split-detail, table-closed-with-full-bill) — this is the accountability layer for management to review disputes or spot-check staff behavior

### 4.5 Kitchen print station (unattended device)
- Not a login screen — a fixed URL meant to be left open permanently on a screen/tablet next to the kitchen printer
- Subscribes to live order data; the instant a waiter sends a ticket, it prints automatically, no touch required
- Tracks what it's already printed so a reconnect or restart never double-prints a backlog
- Requires the host device's browser to run in a silent-printing mode (documented setup step, one-time per device) for true zero-click printing

## 5. Cross-cutting requirements actually implemented

- **Real-time sync** across every open device (Supabase Realtime) — no manual refresh anywhere
- **Bilingual FR/EN** on every string, instant switching (no reload, no stale UI)
- **Automatic time-based status escalation** (preparing → late at 30 min) computed live, not polled
- Full **audit logging** of every state-changing action with actor, reason (where applicable), and timestamp
- Mobile-first responsive design tuned for one-handed phone use (waiter) vs. desktop-dense layouts (cashier), with admin covering both
- Receipt-ratio thermal printing (not browser-default page printing) for both kitchen tickets and bills
- Currency/locale formatting (MAD/DH, French number formatting)

## 6. What this is *not* (useful for scoping/pricing boundaries)

- Not a generic multi-tenant SaaS — single-restaurant deployment (though the schema would generalize)
- Not a native iOS/Android app — responsive web app in a real browser
- No online ordering / customer-facing app — staff-only, all four surfaces are internal
- No payment gateway integration — cash/card are logged as methods, not processed (till/terminal handles the actual transaction)
- No inventory/stock management — menu items are priced dishes, not tracked ingredients
- No reservation system
- Menu content itself (~160 items, bilingual descriptions, pricing) was transcribed from the restaurant's existing printed menu — that data-entry effort is already done and part of the delivered system

## 7. Rough scope size (for estimation reference)

- 4 distinct front-end surfaces sharing one codebase and one design system
- ~20 source modules (routes, shared components, state stores, data/action layers)
- 8 database tables, row-level security policies, 3 Postgres RPC functions for auth
- 25 menu categories / ~160 menu items seeded
- Custom charting (pie + bar + heat-grid), no off-the-shelf dashboard template
- Multiple rounds of real bug fixes already delivered (payment-split math, i18n reactivity, chart rendering, print sizing) — i.e. this is a working, tested system, not a first draft
