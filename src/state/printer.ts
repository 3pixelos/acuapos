import { create } from 'zustand'
import { deviceBranch } from './auth'
import type { Branch } from '../lib/types'

export type PaperWidth = 58 | 80

/**
 * Which till this machine IS. The restaurant runs the desktop app on two:
 * the main caisse and the bar's. Both watch the same ticket queue, so this
 * is what stops each one printing the other's tickets — the single question
 * the cashier has to answer, from which everything else follows:
 *
 *   main -> prints the FOOD tickets, and the bills of every floor but the bar
 *   bar  -> prints the DRINK tickets, and the bills of the Bar floor
 *
 * A restaurant running only one till leaves this on `main` and simply never
 * sets a bar printer; drinks then print at the kitchen.
 */
export type TillRole = 'main' | 'bar'

/**
 * THE BAR PRINTER IS OUT OF SERVICE (2026-08-03).
 *
 * The till already has a printer name typed into the bar field and there is
 * nobody on site to clear it, so the app has to ignore it from here instead.
 * While this is true every station behaves as if no bar printer had ever been
 * configured, which the existing fallbacks already handle correctly:
 *
 *   - drink tickets print at the KITCHEN, alongside the food
 *   - a Bar-floor addition prints at the CAISSE
 *   - the bar status badge disappears, because there is no bar station
 *
 * The stored value is left untouched, not wiped — flipping this back to
 * false is the only edit needed to bring the real bar printer into service,
 * and whatever was typed will still be there.
 */
export const BAR_PRINTER_DISABLED = true

/** The bar printer the app should actually print to — empty while the bar
 * printer is out of service. Read this, never `barPrinterName`, anywhere a
 * ticket or a bill is about to be sent. */
export const effectiveBarPrinter = (barPrinterName: string) =>
  BAR_PRINTER_DISABLED ? '' : barPrinterName

/** A till pinned to the bar would claim only bar tickets and then have
 * nowhere to send them, so while the bar is out of service every till acts
 * as the main one. Without this, a machine left on "caisse du bar" would
 * silently print nothing at all. */
export const effectiveTillRole = (tillRole: TillRole): TillRole =>
  BAR_PRINTER_DISABLED ? 'main' : tillRole

/**
 * What we actually KNOW about a station's printer. It used to be a boolean
 * that started `true` and was reset to `true` on every empty queue, so a till
 * with no printer configured at all cheerfully showed "Cuisine OK" — the one
 * moment the badge is read is while setting a printer up, which is exactly
 * when it was least truthful.
 *
 *   unset    — no printer chosen for this station
 *   untested — chosen, but nothing has been sent to it yet on this device
 *   ok       — something printed successfully
 *   down     — the last attempt failed; tickets are queued
 */
export type StationHealth = 'unset' | 'untested' | 'ok' | 'down'

/**
 * The three printers, configured identically: each holds either a
 * Windows-installed printer NAME or an IP address, and `sendToPrinter`
 * picks the transport from the value's shape. The settings screen is
 * therefore just "which printer is which" — no plumbing questions.
 *
 * WHAT GOES WHERE IS NOT CONFIGURED. It follows from the menu:
 * every item in a `food` category prints at the kitchen, every item in a
 * `drinks` category at the bar. The single exception is a bill for a table
 * on the BAR floor, which comes out of the bar printer so the barman
 * settles their own floor.
 */
interface PrinterState {
  /** Food tickets. */
  kitchenPrinterName: string
  /** Drink tickets, plus the addition of any table on the Bar floor. */
  barPrinterName: string
  /** The full customer bills, friend statements, the fin-de-journée. */
  cashierPrinterName: string
  /** Main caisse or the bar's — see TillRole. */
  tillRole: TillRole
  paperWidth: PaperWidth
  /** Live status of the ticket printers, surfaced as badges on the Caisse
   * UI (there's no screen at the kitchen/bar to show it). Not persisted. */
  kitchenHealth: StationHealth
  barHealth: StationHealth
  /** How many unprinted tickets are currently queued/failing. */
  queued: number
  setConfig: (c: {
    kitchenPrinterName?: string
    barPrinterName?: string
    cashierPrinterName?: string
    tillRole?: TillRole
    paperWidth?: PaperWidth
  }) => void
  setKitchenHealth: (h: StationHealth) => void
  setBarHealth: (h: StationHealth) => void
  setQueued: (n: number) => void
  /** Which location's printer set is currently loaded. Loaded on login; null
   * before anyone has signed in. */
  branch: Branch | null
  /** Swap the loaded config to the given branch's own printer set. */
  loadForBranch: (branch: Branch | null) => void
}

/** Base localStorage key for this device's printer config. Per-location
 * suffix keeps the plumbing generic even though there is one location. */
const LEGACY_KEY = 'acua.printers'
const keyFor = (branch: Branch | null) => (branch ? `${LEGACY_KEY}.${branch}` : LEGACY_KEY)

type StoredConfig = Pick<
  PrinterState,
  'kitchenPrinterName' | 'barPrinterName' | 'cashierPrinterName' | 'tillRole' | 'paperWidth'
>

function readRaw(key: string): StoredConfig | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      kitchenPrinterName?: string
      /** Pre-2026-08 shape: the kitchen was addressed only by IP. That value
       * still works — `sendToPrinter` sees an IP and uses TCP — so it is
       * carried straight over rather than making the cashier re-enter it. */
      kitchenIp?: string
      barPrinterName?: string
      cashierPrinterName?: string
      tillRole?: TillRole
      paperWidth?: PaperWidth
    }
    return {
      kitchenPrinterName: parsed.kitchenPrinterName ?? parsed.kitchenIp ?? '',
      barPrinterName: parsed.barPrinterName ?? '',
      cashierPrinterName: parsed.cashierPrinterName ?? '',
      // An upgraded till was the only one, so it was the main one.
      tillRole: parsed.tillRole === 'bar' ? 'bar' : 'main',
      paperWidth: parsed.paperWidth ?? (80 as PaperWidth),
    }
  } catch {
    return null
  }
}

const EMPTY: StoredConfig = {
  kitchenPrinterName: '',
  barPrinterName: '',
  cashierPrinterName: '',
  tillRole: 'main',
  paperWidth: 80 as PaperWidth,
}

/** The config for a branch: its own saved set, or — the first load only —
 * the pre-branch shared config, so an existing till never comes up blank.
 *
 * A blank config is not harmless: with no bar printer chosen, drinks fall
 * back to the KITCHEN printer. So whenever a branch has no saved set yet we
 * seed it from the old shared key rather than EMPTY. */
function restoreForBranch(branch: Branch | null): StoredConfig {
  const own = readRaw(keyFor(branch))
  if (own) return own
  const legacy = readRaw(LEGACY_KEY)
  if (legacy) return legacy
  return EMPTY
}

function restore() {
  // Before login we don't know the branch yet — fall back to this device's
  // last-seen branch so the print service (which starts pre-login) targets
  // the right printers. Null on a machine nobody has signed into.
  const branch = deviceBranch()
  return { branch, ...restoreForBranch(branch) }
}

function persist(branch: Branch | null, s: StoredConfig) {
  try {
    localStorage.setItem(
      keyFor(branch),
      JSON.stringify({
        kitchenPrinterName: s.kitchenPrinterName,
        barPrinterName: s.barPrinterName,
        cashierPrinterName: s.cashierPrinterName,
        tillRole: s.tillRole,
        paperWidth: s.paperWidth,
      }),
    )
  } catch {
    /* ignore */
  }
}

export const usePrinter = create<PrinterState>((set, get) => ({
  ...restore(),
  kitchenHealth: 'untested',
  barHealth: 'untested',
  queued: 0,
  setConfig: (c) => {
    const next: StoredConfig = {
      kitchenPrinterName: c.kitchenPrinterName ?? get().kitchenPrinterName,
      barPrinterName: c.barPrinterName ?? get().barPrinterName,
      cashierPrinterName: c.cashierPrinterName ?? get().cashierPrinterName,
      tillRole: c.tillRole ?? get().tillRole,
      paperWidth: c.paperWidth ?? get().paperWidth,
    }
    persist(get().branch, next) // save under the branch currently loaded
    set(next)
  },
  loadForBranch: (branch) => {
    // No-op if we're already showing this branch's set (avoids clobbering an
    // in-flight edit on every re-render / refresh).
    if (get().branch === branch) return
    set({ branch, ...restoreForBranch(branch) })
  },
  setKitchenHealth: (kitchenHealth) => set({ kitchenHealth }),
  setBarHealth: (barHealth) => set({ barHealth }),
  setQueued: (queued) => set({ queued }),
}))

/** Printable columns for the configured roll width (font A). */
export const columnsFor = (w: PaperWidth) => (w === 58 ? 32 : 42)
