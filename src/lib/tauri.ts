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

/** Bare IPv4, optionally with a port ("192.168.1.50", "192.168.1.50:9100"). */
const IP_TARGET = /^\d{1,3}(\.\d{1,3}){3}(:\d{1,5})?$/

/**
 * Send a ticket to a printer identified EITHER by its Windows name or by an
 * IP address, picking the transport from the value itself.
 *
 * Every station is configured the same way in the settings — one dropdown of
 * installed Windows printers, which also accepts free text. Most printers
 * here are cabled and go through the spooler, but a networked one that was
 * never installed as a Windows printer still has to be reachable, and for
 * those the cashier types an IP. Deciding by shape means the settings screen
 * never has to ask "is this one on the network?", which is a question about
 * plumbing that nobody at a till should have to answer.
 */
export async function sendToPrinter(target: string, bytes: Uint8Array): Promise<void> {
  const m = IP_TARGET.exec(target.trim())
  if (!m) return printEscPosUsb(target, bytes)
  const [ip, port] = target.trim().split(':')
  return printEscPos(ip, bytes, port ? Number(port) : 9100)
}
