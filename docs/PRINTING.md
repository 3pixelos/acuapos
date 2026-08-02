# Printing & the Caisse desktop app

## The three printers

Acua runs **three** printers, and they are not reached the same way:

| Printer | Connection | What it prints |
| --- | --- | --- |
| **Kitchen** | **Network** — raw TCP `ip:9100` | Food tickets only (everything in a `food` menu category) |
| **Bar** | **Cable** — a Windows printer, picked by name | Drink tickets (`drinks` categories) **and** the addition of any table on the **Bar** floor |
| **Caisse** | **Cable** — a Windows printer, picked by name | The full customer bills, friend statements, the fin-de-journée |

The kitchen printer is the only one with an IP. The bar and the caisse
printers are both cabled, so the app addresses them by the name Windows knows
them under and prints through the Windows spooler — that is why both are a
**dropdown** in the settings, not a text field.

The bar printer is plugged into the **bar's own till**, which therefore has to
be powered on for anything to come out of it.

## Two tills, one queue

The desktop app runs on **both** the main caisse and the bar's caisse. They
watch the *same* `order_items` queue, so each install has to be told **which
stations it is responsible for** — otherwise both would print every ticket and
the kitchen would get two copies of every dish.

Printer settings → **“Cette caisse imprime”**:

| | Kitchen tickets | Bar tickets |
| --- | --- | --- |
| **Main caisse** | ✅ | ☐ |
| **Bar caisse** | ☐ | ✅ |

A till skips tickets for stations it doesn't own — it doesn't print them and,
crucially, doesn't stamp `printed_at` on them, so the other till still picks
them up. The status badges follow the same rule: the bar till shows no kitchen
badge and vice versa.

> **The two tills must not tick the same station.** Nothing enforces this — a
> till has no way to read the other one's settings — so if you ever see every
> ticket printing twice, that's the cause.

Bills are unaffected by these toggles: either till can settle any table.
A **Bar-floor** table's addition goes to the bar printer, everything else to
that machine's caisse printer, so the bar printer stays configurable on both.

## How printing works

Printing is **silent**. There is no kitchen screen, no kiosk browser tab, no
OS print dialog anywhere in the automatic path.

- **Station tickets** print **automatically** with zero human involvement.
  When a waiter sends an order from their phone, rows are written to Supabase.
  The **Caisse desktop app** runs a background service that watches for
  sent-but-unprinted tickets, **splits each order by station** — drinks to the
  bar, food to the kitchen — and streams each part as its own receipt. This
  runs from the moment the app launches, on every screen, before login.
- **Customer bills** print when the cashier taps **“Imprimer l'addition”** on a
  served table. A table on the **Bar** floor prints its bill on the **bar**
  printer so the barman settles their own floor; every other room prints at
  the caisse.
- The **waiter's phone never prints** and never talks to a printer. It only
  writes order rows. (Browsers can't open raw sockets — by design.)

Each sub-ticket succeeds or fails on its own. A row is marked `printed_at`
**only after** its own write succeeds, so the bar being offline queues the
drinks while the food still prints, and everything flushes automatically once
the printer is back — no manual retry.

**Fallbacks, so nothing is ever silently lost:** with no bar printer chosen,
drink tickets print in the kitchen. A bar-floor bill with no bar printer
chosen prints at the caisse.

## One-time setup on the Caisse computer

Do this **on each of the two tills** — the settings are per-device.

1. Install the app (the `.exe` from the GitHub build — see below).
2. Open it, go to the **Caisse** screen, click the **⚙ (Imprimantes)** button
   top-right, and set:
   - **Cette caisse imprime** — tick *Kitchen tickets* on the main till,
     *Bar tickets* on the bar till. Never the same one on both.
   - **Kitchen printer IP** (e.g. `192.168.1.50`) — only shown when this till
     prints kitchen tickets
   - **Bar printer** — pick it from the Windows list
   - **Cashier printer** — pick it from the Windows list
   - **Paper width** (80 mm or 58 mm)
   These are stored on that device.
3. Badges show **“Cuisine OK”** / **“Bar OK”** (green) or the offline variant
   (red, with the number of queued tickets) so staff can see at a glance
   whether printing is flowing.

If the dropdown comes up empty, Windows printer enumeration failed — the field
falls back to free text and you type the printer's **exact** Windows name
(Windows Settings › Printers & scanners).

## Network setup (kitchen printer only)

The kitchen printer needs a **stable IP** — either a static IP set in the
printer's own network menu, or a DHCP reservation on the router keyed to its
MAC address. Otherwise the IP can change after a router reboot and the app's
configured IP goes stale. This is identical for Wi‑Fi and Ethernet — only the
physical connection differs, not the config or the code.

It must expose **raw TCP on port 9100** (JetDirect/AppSocket). Epson
TM-series, Xprinter, Star, etc. all do this by default.

## Client expectation (important)

The Caisse computer is the **only thing** between “waiter sends order” and
“ticket prints.” It must **stay powered on with the app running** throughout
service. The app helps with this:

- **Auto-launches on Windows boot** (survives a power blip / Windows update).
- **Closing the window minimizes to the tray**, it does not quit — ticket
  printing keeps running. Use the tray icon → **Quitter** to fully exit.

This applies to **both** tills. If the bar's till is off, its drink tickets
simply stay queued and flush the moment it comes back — the kitchen is
unaffected — but nothing at the bar prints in the meantime.

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

The desktop app is a **shell around <https://acuapos.vercel.app>** — it loads
the live web app rather than a bundled copy. Pushing a web update to Vercel
therefore reaches every till on the next app restart; nobody has to
re-download the installer. Only a change to the shell itself (window, tray,
printing backend) needs a new `.exe`.

## Building the Android APK

Same idea: `.github/workflows/build-android.yml`, or locally with

```bash
cd android && ./gradlew assembleRelease
```

Signing material is **not** in the repo. Locally it comes from
`android/keystore.properties` (gitignored) pointing at
`android/acua-release.keystore`; in CI it comes from the repository secrets
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`
and `ANDROID_KEY_PASSWORD`. **Keep the keystore and its password** — an
update signed with a different key cannot install over the existing app.

## Local development

- Web dev (waiter/admin/caisse in a browser): `npm run dev` — unchanged.
  Printing has no effect in a browser; the “print bill” button falls back to
  the OS print dialog so it's still usable off the till.
- Desktop dev (real printing, tray, etc.): `npm run tauri:dev` (needs the
  Rust toolchain installed).
