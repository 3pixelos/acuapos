import { useEffect } from 'react'
import { supabase } from './supabase'
import { buildKitchenTicket } from './print'
import { inTauri, printEscPos, printEscPosUsb } from './tauri'
import { usePrinter, columnsFor } from '../state/printer'
import { deviceBranch } from '../state/auth'
import { BAR_ROUTED_ITEM_NAMES, INCLUDED_DRINK_CATEGORY, type OrderItem } from './types'

/**
 * The silent ticket-print backbone. Runs only inside the Caisse desktop
 * (Tauri) app, mounted once at the app root — not a screen, not a route,
 * nothing anyone opens. It watches order_items for sent-but-unprinted
 * tickets and streams each to the right printer.
 *
 * Two stations: every ticket is split by the item's MAIN category — drinks
 * go to the BAR printer, everything else to the KITCHEN printer, each as
 * its own receipt. The caisse bill is untouched; the split only exists at
 * ordering time.
 *
 * The two stations are reached DIFFERENTLY. The kitchen printer is the only
 * one on the network (raw TCP :9100). The bar printer is cabled to the bar's
 * own till, so it is addressed by its Windows printer NAME through the
 * spooler — the same route the cashier printer uses. If no bar printer has
 * been picked yet, drinks fall back to the kitchen rather than queueing
 * forever on a station that isn't set up.
 *
 * Each sub-ticket succeeds or fails on its own: rows are marked
 * `printed_at` ONLY after their own write is confirmed, so the bar being
 * offline queues the drinks while the food still prints (and vice versa) —
 * everything flushes automatically once the printer is back.
 */

export type Station = 'kitchen' | 'bar'

/** The printer config a station plan is decided from. */
export interface StationConfig {
  kitchenIp: string
  barPrinterName: string
  printsKitchen: boolean
  printsBar: boolean
}

export interface StationPlan {
  /** Does this machine take tickets for that station at all? */
  owns: (s: Station) => boolean
  /** Owns it AND has somewhere to send it. */
  canPrint: (s: Station) => boolean
  /** True on a single-till setup with no bar printer: drinks come out of the
   * kitchen printer. Never true on a machine that serves only the bar — there
   * it would push drinks onto a printer this till isn't responsible for. */
  barFallsBackToKitchen: boolean
  /** Nothing to do — this machine prints no order tickets. */
  idle: boolean
}

/**
 * Which stations this machine takes off the shared queue, and whether it can
 * actually print them. Pure, and separated out because it is the one piece of
 * logic that decides whether the two tills cooperate or fight: a till must
 * leave the other's tickets completely alone — unprinted AND unstamped.
 */
export function planStations(cfg: StationConfig): StationPlan {
  const { kitchenIp, barPrinterName, printsKitchen, printsBar } = cfg
  const owns = (s: Station) => (s === 'bar' ? printsBar : printsKitchen)
  const barFallsBackToKitchen = printsBar && printsKitchen && !barPrinterName && Boolean(kitchenIp)
  const canPrint = (s: Station) =>
    s === 'bar'
      ? printsBar && (Boolean(barPrinterName) || barFallsBackToKitchen)
      : printsKitchen && Boolean(kitchenIp)
  return { owns, canPrint, barFallsBackToKitchen, idle: !printsKitchen && !printsBar }
}

export function useKitchenPrintService() {
  useEffect(() => {
    // Never run on the waiter's phone or a plain web build — only the one
    // persistent native device can talk to a TCP printer.
    if (!inTauri()) return

    let disposed = false
    let printing = false
    let rerun = false
    let backoff = 3000
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    // menu_item_id -> main category ('drinks', 'lunch', …). Fetched once,
    // then kept fresh cheaply on every pass (menu edits are rare).
    let mainByMenuItem = new Map<string, string>()
    let mainByCatName = new Map<string, string>()
    const loadMenuRouting = async () => {
      const [{ data: cats }, { data: menu }] = await Promise.all([
        supabase.from('menu_categories').select('id, name_fr, main'),
        supabase.from('menu_items').select('id, category_id'),
      ])
      const mainByCatId = new Map((cats ?? []).map((c) => [c.id as string, (c.main as string) ?? '']))
      mainByCatName = new Map((cats ?? []).map((c) => [c.name_fr as string, (c.main as string) ?? '']))
      mainByMenuItem = new Map(
        (menu ?? []).map((m) => [m.id as string, mainByCatId.get(m.category_id as string) ?? '']),
      )
    }

    /** Which printer an item belongs to. Anything not clearly a drink goes
     * to the kitchen — a mis-routed ticket beats a silently missing one. */
    const stationOf = (it: OrderItem): Station => {
      // included breakfast drinks are made by the barman
      if (it.category === INCLUDED_DRINK_CATEGORY) return 'bar'
      // name-level overrides: drinks living in a food category (Mini Orange
      // sits in Extras Breakfast but the barman makes it)
      if (BAR_ROUTED_ITEM_NAMES.some((n) => n.toLowerCase() === it.name.toLowerCase())) return 'bar'
      const main =
        (it.menu_item_id && mainByMenuItem.get(it.menu_item_id)) ??
        mainByCatName.get(it.category) ??
        ''
      // drinks -> bar; food (and anything unclassified) -> kitchen
      if (main === 'drinks') return 'bar'
      return 'kitchen'
    }

    const ticketCount = (items: OrderItem[]) =>
      new Set(items.map((i) => `${i.session_id}:${i.ticket_no}:${stationOf(i)}`)).size

    const process = async () => {
      if (printing) {
        rerun = true
        return
      }
      printing = true
      try {
        // Loop until nothing unprinted remains (catches anything that arrived
        // mid-batch), or until a print fails and we back off.
        for (;;) {
          if (disposed) break

          // LOCATION SCOPING. order_items has no branch of its own (it hangs
          // off a session), so join through and filter on the session's.
          // It's the DEVICE's location, not the signed-in user's: this service
          // starts with the app (auto-launch on boot) and keeps running while
          // the till sits on the login screen, where there is no user to scope
          // by. A machine nobody has ever signed into has no location at all
          // and deliberately prints nothing rather than guessing.
          const branch = deviceBranch()
          if (!branch) break
          // The session must also still be OPEN. Without that a line queued
          // while a printer was down, whose table was then closed/freed,
          // stayed eligible forever — and flushed out hours or days later on
          // whatever ticket happened to trigger the next pass. Its session is
          // closed, so the app shows it nowhere: that is an item appearing on
          // a receipt having "never been in the system". A cancelled table's
          // food isn't being cooked either, so it's excluded too.
          const { data } = await supabase
            .from('order_items')
            .select('*, table_sessions!inner(branch, closed_at, cancelled)')
            .not('ticket_no', 'is', null)
            .is('printed_at', null)
            .eq('voided', false)
            .is('table_sessions.closed_at', null)
            .eq('table_sessions.cancelled', false)
            .eq('table_sessions.branch', branch)
            .order('created_at')
          const queue = (data ?? []) as unknown as OrderItem[]
          if (!queue.length) {
            usePrinter.getState().setQueued(0)
            usePrinter.getState().setKitchenOnline(true)
            usePrinter.getState().setBarOnline(true)
            break
          }

          await loadMenuRouting()

          const { kitchenIp, barPrinterName, printsKitchen, printsBar, paperWidth } =
            usePrinter.getState()

          // STATION OWNERSHIP. Both tills — the main caisse and the bar's —
          // run this service against the same queue. Each only takes the
          // stations it was told it serves, and leaves the rest untouched
          // (not printed, not stamped) for the other machine to collect.
          // Without this every ticket would print twice, once per till.
          const plan = planStations({ kitchenIp, barPrinterName, printsKitchen, printsBar })
          if (plan.idle) break // this machine prints no order tickets at all

          const items = queue.filter((i) => plan.owns(stationOf(i)))
          if (!items.length) {
            // Everything queued belongs to the other till. Nothing is wrong
            // here, so report idle rather than a phantom backlog.
            usePrinter.getState().setQueued(0)
            break
          }
          usePrinter.getState().setQueued(ticketCount(items))

          // A station this machine owns but has no printer for can't proceed;
          // surface it and stop rather than spinning.
          if (printsKitchen && !plan.canPrint('kitchen')) {
            usePrinter.getState().setKitchenOnline(false)
            break
          }
          if (printsBar && !plan.canPrint('bar')) {
            usePrinter.getState().setBarOnline(false)
            break
          }
          const cols = columnsFor(paperWidth)
          const sendTo = (station: Station, bytes: Uint8Array) =>
            station === 'bar' && barPrinterName
              ? printEscPosUsb(barPrinterName, bytes)
              : printEscPos(kitchenIp, bytes)
          const headerFor: Record<Station, 'CUISINE' | 'BAR'> = {
            kitchen: 'CUISINE',
            bar: 'BAR',
          }

          // group rows into sub-tickets: session + ticket number + station
          const groups = new Map<string, OrderItem[]>()
          for (const it of items) {
            const key = `${it.session_id}:${it.ticket_no}:${stationOf(it)}`
            groups.set(key, [...(groups.get(key) ?? []), it])
          }

          // resolve table labels + waiter names for the ticket header
          const sessionIds = [...new Set(items.map((i) => i.session_id))]
          const [{ data: sessions }, { data: tables }, { data: staffRows }] = await Promise.all([
            supabase.from('table_sessions').select('id, table_ids, waiter_id, covers').in('id', sessionIds),
            supabase.from('restaurant_tables').select('id, label'),
            supabase.from('staff_public').select('id, name'),
          ])
          const labelById = new Map((tables ?? []).map((t) => [t.id as string, t.label as string]))
          const staffById = new Map((staffRows ?? []).map((s) => [s.id as string, s.name as string]))
          const refById = new Map(
            (sessions ?? []).map((s) => [
              s.id as string,
              (s.table_ids as string[]).map((id) => labelById.get(id) ?? id).join('+'),
            ]),
          )
          const waiterBySession = new Map(
            (sessions ?? []).map((s) => [s.id as string, staffById.get(s.waiter_id as string) ?? '']),
          )
          const coversBySession = new Map(
            (sessions ?? []).map((s) => [s.id as string, s.covers as number]),
          )

          // One station going down must not stop the other: remember which
          // stations failed this pass and skip their remaining sub-tickets
          // (no point stacking 4-second timeouts against a dead printer).
          const stationDown: Record<Station, boolean> = { kitchen: false, bar: false }
          for (const [key, groupItems] of groups) {
            const [sessionId, ticketNoStr, station] = key.split(':') as [string, string, Station]
            if (stationDown[station]) continue
            const tableRef = refById.get(sessionId) ?? '?'
            const bytes = buildKitchenTicket({
              tableRef,
              ticketNo: Number(ticketNoStr),
              waiter: waiterBySession.get(sessionId) ?? '',
              covers: coversBySession.get(sessionId),
              items: groupItems,
              cols,
              station: headerFor[station],
            })
            try {
              await sendTo(station, bytes)
            } catch (e) {
              console.error(`[${station}-print] failed, leaving ticket queued:`, e)
              stationDown[station] = true
              continue
            }
            // Only NOW is it safe to mark printed.
            await supabase
              .from('order_items')
              .update({ printed_at: new Date().toISOString() })
              .in('id', groupItems.map((i) => i.id))
            await new Promise((r) => setTimeout(r, 300)) // let the printer breathe
          }
          // A station this machine doesn't serve is reported OK — its badge
          // is hidden anyway, and "offline" would be a lie about a printer
          // this till was never asked to reach.
          usePrinter.getState().setKitchenOnline(!printsKitchen || !stationDown.kitchen)
          // When the bar falls back to the kitchen printer it shares that
          // printer's status — that's where its tickets actually went.
          usePrinter
            .getState()
            .setBarOnline(
              !printsBar || !(barPrinterName ? stationDown.bar : stationDown.kitchen),
            )
          if (stationDown.kitchen || stationDown.bar) break
        }
      } finally {
        printing = false
        // Reschedule: if work is still queued (printer offline/unset) retry
        // with growing backoff; otherwise reset and rely on realtime.
        if (!disposed) {
          if (rerun) {
            rerun = false
            void process()
          } else if (usePrinter.getState().queued > 0) {
            backoff = Math.min(backoff * 2, 30000)
            clearTimeout(retryTimer)
            retryTimer = setTimeout(() => void process(), backoff)
          } else {
            backoff = 3000
            clearTimeout(retryTimer)
          }
        }
      }
    }

    void process()
    const channel = supabase
      .channel('kitchen-print')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () =>
        void process(),
      )
      .subscribe()

    return () => {
      disposed = true
      clearTimeout(retryTimer)
      void supabase.removeChannel(channel)
    }
  }, [])
}
