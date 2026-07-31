# Printing & the Caisse desktop app

## How printing works now

Printing is **silent, direct-to-network**. There is no kitchen screen, no
kiosk browser tab, no OS print dialog anywhere in the automatic path.

- **Kitchen tickets** print **automatically** with zero human involvement.
  When a waiter sends an order (from their phone), rows are written to
  Supabase. The **Caisse desktop app** runs a background service that watches
  for sent-but-unprinted tickets and streams each one straight to the kitchen
  printer over TCP (`ip:9100`, raw ESC/POS). This runs from the moment the app
  launches, on every screen, before login — the cashier never sees or touches
  it.
- **Customer bills** print when the cashier taps **“Imprimer & fermer”** on a
  served table — same TCP path, targeting the *cashier* printer instead.
- The **waiter’s phone never prints** and never talks to a printer. It only
  writes order rows. (Browsers can’t open raw sockets — by design.)

A ticket is marked `printed_at` **only after** the socket write succeeds. If
the printer is unreachable the ticket stays queued and reprints automatically
once it’s back — no manual retry.

## One-time setup on the Caisse computer

1. Install the app (the `.exe` from the GitHub build — see below).
2. Open it, go to the **Caisse** screen, click the **⚙ (Imprimantes)** button
   top-right, and enter:
   - **Kitchen printer IP** (e.g. `192.168.1.50`)
   - **Cashier printer IP** (e.g. `192.168.1.51`)
   - **Paper width** (80 mm or 58 mm)
   These are stored on that device.
3. A small badge shows **“Cuisine OK”** (green) or **“Cuisine hors ligne”**
   (red, with the number of queued tickets) so staff can see at a glance
   whether kitchen printing is flowing.

## Network setup (router / printers)

Each network printer needs a **stable IP** — either a static IP set in the
printer’s own network menu, or a DHCP reservation on the router keyed to the
printer’s MAC address. Otherwise the IP can change after a router reboot and
the app’s configured IP goes stale. This is identical for Wi‑Fi and Ethernet —
only the physical connection differs, not the config or the code.

Printers must expose **raw TCP on port 9100** (JetDirect/AppSocket). Epson
TM-series, Xprinter, Star, etc. all do this by default.

## Client expectation (important)

The Caisse computer is now the **only thing** between “waiter sends order” and
“ticket prints.” It must **stay powered on with the app running** throughout
service. The app helps with this:

- **Auto-launches on Windows boot** (survives a power blip / Windows update).
- **Closing the window minimizes to the tray**, it does not quit — kitchen
  printing keeps running. Use the tray icon → **Quitter** to fully exit.

## Building the Windows `.exe`

CI builds it via **GitHub Actions** (`.github/workflows/build-windows.yml`).

1. Add two **repository secrets** (Settings → Secrets and variables → Actions):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   These get baked into the app so it talks to the right Supabase project.
2. Trigger a build:
   - **Manual:** Actions tab → “Build Windows app” → *Run workflow*. The
     installer is uploaded as a build **artifact**.
   - **Release:** push a version tag (`git tag v0.1.0 && git push --tags`).
     The installer is also attached to a **GitHub Release**.

The output is an NSIS setup `.exe` under
`src-tauri/target/release/bundle/nsis/`.

## Local development

- Web dev (waiter/admin/caisse in a browser): `npm run dev` — unchanged.
  Printing has no effect in a browser; the “print bill” button falls back to
  the OS print dialog so it’s still usable off the till.
- Desktop dev (real TCP printing, tray, etc.): `npm run tauri:dev` (needs the
  Rust toolchain installed).
