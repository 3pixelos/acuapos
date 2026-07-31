import { create } from 'zustand'
import { deviceBranch } from './auth'
import type { Branch } from '../lib/types'

export type PaperWidth = 58 | 80

interface PrinterState {
  kitchenIp: string
  /** Bar printer (wireless, TCP :9100 like the kitchen). Gets a separate
   * ticket with only the drinks of each order. */
  barIp: string
  /** Sweets/desserts printer (wireless, TCP :9100). Gets its own ticket
   * with only the dessert items. Empty = desserts fall back to the bar
   * printer, which is where they used to print. */
  sweetsIp: string
  /** Windows-installed printer name for the cashier/bill printer — it's
   * USB-cabled to the till PC, not on the network, so we print straight to
   * the Windows spooler instead of TCP. */
  cashierPrinterName: string
  paperWidth: PaperWidth
  /** Live status of the ticket printers, surfaced as badges on the Caisse
   * UI (there's no screen at the kitchen/bar to show it). Not persisted. */
  kitchenOnline: boolean
  barOnline: boolean
  sweetsOnline: boolean
  /** How many unprinted tickets are currently queued/failing. */
  queued: number
  setConfig: (c: {
    kitchenIp?: string
    barIp?: string
    sweetsIp?: string
    cashierPrinterName?: string
    paperWidth?: PaperWidth
  }) => void
  setKitchenOnline: (online: boolean) => void
  setBarOnline: (online: boolean) => void
  setSweetsOnline: (online: boolean) => void
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
  'kitchenIp' | 'barIp' | 'sweetsIp' | 'cashierPrinterName' | 'paperWidth'
>

function readRaw(key: string): StoredConfig | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      kitchenIp?: string
      barIp?: string
      sweetsIp?: string
      cashierPrinterName?: string
      paperWidth?: PaperWidth
    }
    return {
      kitchenIp: parsed.kitchenIp ?? '',
      barIp: parsed.barIp ?? '',
      sweetsIp: parsed.sweetsIp ?? '',
      cashierPrinterName: parsed.cashierPrinterName ?? '',
      paperWidth: parsed.paperWidth ?? (80 as PaperWidth),
    }
  } catch {
    return null
  }
}

const EMPTY: StoredConfig = {
  kitchenIp: '',
  barIp: '',
  sweetsIp: '',
  cashierPrinterName: '',
  paperWidth: 80 as PaperWidth,
}

/** The config for a branch: its own saved set, or — the first load only —
 * the pre-branch shared config, so an existing till never comes up blank.
 *
 * A blank config is not harmless: with no bar IP, drinks fall back to the
 * KITCHEN printer, and with no sweets IP, desserts fall back to the BAR. So
 * whenever a branch has no saved set yet we seed it from the old shared key
 * rather than EMPTY. Branch tills are separate machines, each carrying its
 * own device's legacy config, so each seeds from the right printers; a single
 * machine used for both branches seeds both the same and the cashier then
 * adjusts — exactly the behaviour before per-branch config existed. */
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
        barIp: s.barIp,
        sweetsIp: s.sweetsIp,
        cashierPrinterName: s.cashierPrinterName,
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
  sweetsOnline: true,
  queued: 0,
  setConfig: (c) => {
    const next: StoredConfig = {
      kitchenIp: c.kitchenIp ?? get().kitchenIp,
      barIp: c.barIp ?? get().barIp,
      sweetsIp: c.sweetsIp ?? get().sweetsIp,
      cashierPrinterName: c.cashierPrinterName ?? get().cashierPrinterName,
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
  setSweetsOnline: (sweetsOnline) => set({ sweetsOnline }),
  setQueued: (queued) => set({ queued }),
}))

/** Printable columns for the configured roll width (font A). */
export const columnsFor = (w: PaperWidth) => (w === 58 ? 32 : 42)
