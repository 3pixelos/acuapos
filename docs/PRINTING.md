# Printing & the Caisse desktop app

## The three printers

Acua runs **three** printers:

| Printer | What it prints |
| --- | --- |
| **Kitchen** | Food tickets — everything in a `food` menu category |
| **Bar** | Drink tickets (`drinks` categories) **and** the bill of any table on the **Bar** floor |
| **Caisse** | The full customer bills for every other floor, friend statements, the fin-de-journée |

All three are configured identically: one dropdown of the printers Windows
has installed. A printer can also be given a **bare IP** — pick *Autre…* and
type it — for a networked printer that was never installed as a Windows
printer. The app decides the transport from the value's shape (`sendToPrinter`
in `src/lib/tauri.ts`): an IP goes over raw TCP `:9100`, anything else through
the Windows spooler. The settings screen never asks which is which.

**Nothing configures what prints where.** It follows from the menu: an item in
a category whose `main` is `food` prints at the kitchen, `drinks` at the bar.
Change a category's `main` and its routing follows. The single exception is
the bill of a table on the Bar floor, which comes out of the bar printer.

The bar printer is plugged into the **bar's own till**, which therefore has to
be powered on for anything to come out of it.

## Two tills, one queue

The desktop app runs on **both** the main caisse and the bar's caisse. They
watch the *same* `order_items` queue, so each install has to be told **which
one it is** — otherwise both would print every ticket and the kitchen would
get two copies of every dish.

Printer settings → **“Cette caisse est”**. One choice per machine, and
everything follows from it:

| This till is | Prints these tickets | Prints these bills |
| --- | --- | --- |
| **La caisse principale** | food | every floor except the Bar |
| **La caisse du bar** | drinks | the Bar floor's tables |

A till skips tickets for the other one's station — it doesn't print them and,
crucially, doesn't stamp `printed_at` on them, so the other till still picks
them up. The status badges follow the same rule: the bar till shows no kitchen
badge and vice versa.

Because there is one setting with two values rather than two independent
checkboxes, the two tills **cannot** both claim the same station. That whole
class of double-printing is gone.

Bills are routed by the **table's floor**, not by which till you press the
button on, so keep all three printers filled in on both machines: the bar's
till can be asked to settle a Salon table, and the main till a Bar one.

**Running only one till?** Leave it on *La caisse principale* and set no bar
printer — drinks then print at the kitchen.

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
   - **Cette caisse est** — *La caisse principale* on one machine, *La caisse
     du bar* on the other.
   - **Kitchen printer** — pick it from the Windows list, or *Autre…* and type
     its IP (e.g. `192.168.1.50`) if it is on the network
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

## Network setup (only if a printer is addressed by IP)

A printer given an IP rather than a Windows name needs a **stable** one —
either a static IP set in the printer's own network menu, or a DHCP
reservation on the router keyed to its MAC address. Otherwise the IP changes
after a router reboot and the configured value goes stale. This is identical
for Wi‑Fi and Ethernet — only the physical connection differs.

It must expose **raw TCP on port 9100** (JetDirect/AppSocket). Epson
TM-series, Xprinter, Star, etc. all do this by default. Installing it as a
Windows printer instead sidesteps all of this — then it is just another name
in the dropdown.

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
