import { invoke, isTauri } from '@tauri-apps/api/core'

/** True only when running inside the Caisse desktop (Tauri) app — never in
 * the waiter's mobile browser or a plain web build. */
export const inTauri = () => isTauri()

/**
 * Send raw ESC/POS bytes to a network printer via the Rust backend
 * (TCP :9100). Resolves on a confirmed socket write, rejects on any
 * failure (unreachable printer, timeout, …) so callers can decide whether
 * to mark a ticket printed or leave it queued.
 */
export async function printEscPos(ip: string, bytes: Uint8Array, port = 9100): Promise<void> {
  await invoke('print_escpos', { ip, port, data: Array.from(bytes) })
}

/**
 * Send raw ESC/POS bytes straight to a printer installed in Windows (USB or
 * LPT — no network involved). Used for the cashier/bill printer, which is
 * cabled directly to the till PC.
 */
export async function printEscPosUsb(printerName: string, bytes: Uint8Array): Promise<void> {
  await invoke('print_escpos_usb', { printerName, data: Array.from(bytes) })
}

/** Printers currently installed in Windows, for the settings dropdown. */
export async function listPrinters(): Promise<string[]> {
  return invoke('list_printers')
}
