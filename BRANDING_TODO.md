# Acua branding — status

The **ACUA logo** (teal wordmark + pink "CAFÉ · RESTAURANT · LOUNGE" tagline,
pale-blue field) is now applied everywhere, recreated as vector art in
[`branding/acua-logo.svg`](branding/acua-logo.svg).

## ✅ Done — logo applied
| Asset | Status |
|---|---|
| `public/favicon.svg` | ✅ ACUA wordmark |
| `public/icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | ✅ regenerated from logo |
| `src/components/AcuaLogo.tsx` | ✅ inline logo used in Login (with tagline) + TopBar |
| `src/lib/receiptLogo.ts` | ✅ regenerated 1-bit thermal raster + PNG from logo (`branding/gen-receipt-logo.cjs`) |
| `src-tauri/icons/*`, Android `mipmap-*`, iOS `AppIcon-*` | ✅ regenerated via `tauri icon` |
| Tagline / app name | ✅ `ACUA` · `CAFÉ · RESTAURANT · LOUNGE` |

> The logo is a faithful **vector recreation**. If you have the original
> high-res artwork, drop it in and re-run `rsvg-convert` / `tauri icon` /
> `node branding/gen-receipt-logo.cjs` to swap in the exact source.

## ⏳ Still placeholder (need real values — search `TODO(client)`)
- **Receipt footer** — `src/lib/print.ts` `FOOTER`: website/socials/tax-no/address are placeholders (`WWW.ACUA.ES`, etc.).
- **Web Push** — `src/lib/push.ts` still ships Beymen's VAPID public key and a placeholder notify URL. Generate a fresh keypair (`npx web-push generate-vapid-keys`), deploy Acua's own `api/notify.js`, and set the private key in that function's env.
- **Deployed URLs** — Tauri (`tauri.conf.json`, `capabilities/default.json`) and Android (`MainActivity.java`) load `https://acua-pos.vercel.app` — repoint once Acua is deployed.
