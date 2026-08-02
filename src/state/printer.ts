import { create } from 'zustand'
import { deviceBranch } from './auth'
import type { Branch } from '../lib/types'

export type PaperWidth = 58 | 80

interface PrinterState {
  /** Kitchen printer — the only NETWORK one. Wireless/LAN, raw TCP :9100.
   * Prints food tickets and nothing else. */
  kitchenIp: string
  /** Bar printer — Windows-installed printer NAME, not an IP. It is cabled
   * to the bar's own till, so it is reached through the Windows spooler
   * exactly like the cashier printer (a shared printer from the bar PC shows
   * up in the same dropdown). It prints two things: the drink lines of every
   * order, and the bill of any table standing on the BAR floor. */
  barPrinterName: string
  /** Windows-installed printer name for the cashier/bill printer — it's
   * USB-cabled to the till PC, not on the network, so we print straight to
   * the Windows spooler instead of TCP. Prints the full receipts. */
  cashierPrinterName: string
  /** WHICH STATIONS THIS MACHINE IS RESPONSIBLE FOR.
   *
   * There are two tills running the desktop app: the main caisse (kitchen
   * printer on the LAN + its own bill printer) and the bar's caisse (bar
   * printer on its cable). Both watch the same `order_items` queue, so
   * without this they would each print EVERY ticket — the kitchen would get
   * two copies of every dish and the bar two of every drink.
   *
   * Each machine ticks only the stations it actually serves. The service
   * then ignores tickets for stations it doesn't own and, crucially, never
   * stamps `printed_at` on them — so the other till still picks them up.
   *
   * The two tills' selections must not overlap. Nothing enforces that (a
   * till has no way to know what the other one is set to); the settings
   * screen spells it out instead. */
  printsKitchen: boolean
  printsBar: boolean
  paperWidth: PaperWidth
  /** Live status of the ticket printers, surfaced as badges on the Caisse
   * UI (there's no screen at the kitchen/bar to show it). Not persisted. */
  kitchenOnline: boolean
  barOnline: boolean
  /** How many unprinted tickets are currently queued/failing. */
  queued: number
  setConfig: (c: {
    kitchenIp?: string
    barPrinterName?: string
    cashierPrinterName?: string
    printsKitchen?: boolean
    printsBar?: boolean
    paperWidth?: PaperWidth
  }) => void
  setKitchenOnline: (online: boolean) => void
  setBarOnline: (online: boolean) => void
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
  | 'kitchenIp'
  | 'barPrinterName'
  | 'cashierPrinterName'
  | 'printsKitchen'
  | 'printsBar'
  | 'paperWidth'
>

function readRaw(key: string): StoredConfig | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      kitchenIp?: string
      barPrinterName?: string
      /** Pre-2026-08 shape: the bar was a network printer with an IP, and
       * desserts had a third printer of their own. Both are gone — an IP is
       * meaningless as a Windows printer name, so it is dropped rather than
       * migrated, and the cashier picks the bar printer from the dropdown. */
      barIp?: string
      cashierPrinterName?: string
      printsKitchen?: boolean
      printsBar?: boolean
      paperWidth?: PaperWidth
    }
    return {
      kitchenIp: parsed.kitchenIp ?? '',
      barPrinterName: parsed.barPrinterName ?? '',
      cashierPrinterName: parsed.cashierPrinterName ?? '',
      // A config saved before stations existed came from a single-till
      // setup, where that one machine printed everything. Defaulting to
      // both keeps it behaving exactly as it did.
      printsKitchen: parsed.printsKitchen ?? true,
      printsBar: parsed.printsBar ?? true,
      paperWidth: parsed.paperWidth ?? (80 as PaperWidth),
    }
  } catch {
    return null
  }
}

const EMPTY: StoredConfig = {
  kitchenIp: '',
  barPrinterName: '',
  cashierPrinterName: '',
  printsKitchen: true,
  printsBar: true,
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
        kitchenIp: s.kitchenIp,
        barPrinterName: s.barPrinterName,
        cashierPrinterName: s.cashierPrinterName,
        printsKitchen: s.printsKitchen,
        printsBar: s.printsBar,
        paperWidth: s.paperWidth,
      }),
    )
  } catch {
    /* ignore */
  }
}

export const usePrinter = create<PrinterState>((set, get) => ({
  ...restore(),
  kitchenOnline: true,
  barOnline: true,
  queued: 0,
  setConfig: (c) => {
    const next: StoredConfig = {
      kitchenIp: c.kitchenIp ?? get().kitchenIp,
      barPrinterName: c.barPrinterName ?? get().barPrinterName,
      cashierPrinterName: c.cashierPrinterName ?? get().cashierPrinterName,
      printsKitchen: c.printsKitchen ?? get().printsKitchen,
      printsBar: c.printsBar ?? get().printsBar,
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
  setKitchenOnline: (kitchenOnline) => set({ kitchenOnline }),
  setBarOnline: (barOnline) => set({ barOnline }),
  setQueued: (queued) => set({ queued }),
}))

/** Printable columns for the configured roll width (font A). */
export const columnsFor = (w: PaperWidth) => (w === 58 ? 32 : 42)
