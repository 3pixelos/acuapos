import type { OrderItem, Payment } from './types'
import { INCLUDED_DRINK_CATEGORY } from './types'
import { money } from './format'
import { EscPos, lr } from './escpos'
import { inTauri, sendToPrinter } from './tauri'
import { usePrinter, columnsFor } from '../state/printer'
import {
  RECEIPT_LOGO_HEIGHT,
  RECEIPT_LOGO_PNG,
  RECEIPT_LOGO_WIDTH,
  receiptLogoRaster,
} from './receiptLogo'

/* ------------------------------------------------------------------ *
 * ESC/POS receipt builders (raw bytes for a network thermal printer)  *
 * ------------------------------------------------------------------ */

/** Takeout tables are labelled EMP1..EMP5 (layer "emporter"). Any receipt
 * for one is stamped "À EMPORTER" so kitchen/bar/caisse pack it to go. */
const isTakeout = (tableRef: string) => /(^|\+)\s*EMP\d/i.test(tableRef)

/** dd/mm/yyyy hh:mm:ss — the timestamp format on both receipt footers. */
function stamp(ts = Date.now()): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/**
 * Station ticket (kitchen or bar), modeled on the old POS's tickets the
 * team is used to reading at a glance: an inverted header band with the
 * table number and ticket number, the waiter's name, then one big line
 * per item — no prices, no category noise.
 */
export function buildKitchenTicket(opts: {
  tableRef: string
  ticketNo: number
  waiter: string
  items: OrderItem[]
  cols?: number
  station?: 'CUISINE' | 'BAR'
  /** Guests seated — printed on the station ticket so the line knows the
   * table size at a glance. */
  covers?: number
}): Uint8Array {
  const { tableRef, ticketNo, waiter, items, cols = 42, station = 'CUISINE', covers } = opts
  const p = new EscPos()

  // header band: white-on-black, double size — table left, ticket # right
  const half = Math.floor(cols / 2) // double-width chars: half the columns fit
  p.invert(true).bold(true).size(1, 1)
  p.line(lr(` ${tableRef}`, `${String(ticketNo).padStart(4, '0')} `, half))
  p.invert(false).size(0, 0)

  p.feed(1).bold(true).line(`${waiter.toUpperCase()} — ${station}`).bold(false)
  if (covers && covers > 0) p.bold(true).size(0, 1).line(`${covers} COUVERTS`).size(0, 0).bold(false)
  if (isTakeout(tableRef)) {
    p.align('center').invert(true).bold(true).size(1, 1).line(' A EMPORTER ')
    p.size(0, 0).bold(false).invert(false).align('left')
  }
  p.rule(cols)

  // Included-drink lines ("<breakfast> — <drink> inclus") group under ONE
  // header per breakfast with the drinks as bullets — a 2-drink Kahvalti
  // must not read as two Kahvaltis on the bar ticket.
  const normal = items.filter((i) => i.category !== INCLUDED_DRINK_CATEGORY)
  const drinkGroups = new Map<string, OrderItem[]>()
  for (const i of items) {
    if (i.category !== INCLUDED_DRINK_CATEGORY) continue
    const sep = i.name.indexOf(' — ')
    const parent = sep > 0 ? i.name.slice(0, sep) : i.name
    drinkGroups.set(parent, [...(drinkGroups.get(parent) ?? []), i])
  }

  for (const i of normal) {
    p.size(1, 1).line(`${i.qty}  ${i.name.toUpperCase()}`).size(0, 0)
    // notes are instructions for the cook — bold, tall and uppercase so
    // they can't be missed on the rail
    if (i.note) p.bold(true).size(0, 1).line(`   » ${i.note.toUpperCase()}`).size(0, 0).bold(false)
    p.feed(1)
  }
  for (const [parent, drinks] of drinkGroups) {
    p.size(1, 1).line(parent.toUpperCase()).size(0, 0)
    for (const d of drinks) {
      const sep = d.name.indexOf(' — ')
      const label = sep > 0 ? d.name.slice(sep + 3) : d.name
      p.size(0, 1)
        .line(`   - ${d.qty}x ${label.toUpperCase()}`)
        .size(0, 0)
      // the waiter's note on the included drink (e.g. "sans sucre")
      if (d.note) p.bold(true).size(0, 1).line(`      » ${d.note.toUpperCase()}`).size(0, 0).bold(false)
    }
    p.feed(1)
  }

  p.rule(cols)
  p.align('center').line(stamp()).align('left')
  p.cut()
  return p.bytes()
}

/**
 * A short ticket the cashier can fire at any printer from the settings
 * screen. The status badges can only report on tickets that happened to be
 * queued, which is no use while setting a printer up — this is the one way
 * to answer "is this actually the right printer, and is it reachable?"
 * without waiting for a real order.
 */
export function buildTestTicket(station: string, cols = 42): Uint8Array {
  const p = new EscPos()
  p.align('center')
  p.invert(true).bold(true).size(1, 1).line('  TEST  ').size(0, 0).bold(false).invert(false)
  p.feed(1).bold(true).size(0, 1).line(station.toUpperCase()).size(0, 0).bold(false)
  p.line('ACUA POS')
  p.feed(1).align('left').rule(cols)
  p.line('Si vous lisez ceci, cette')
  p.line('imprimante est la bonne et')
  p.line('elle repond.')
  p.rule(cols)
  p.align('center').line(stamp()).align('left')
  p.feed(1).cut()
  return p.bytes()
}

/** Everything the customer bill shows besides the item lines. */
export interface BillMeta {
  /** Cashier's display name (CAISSIER line). */
  cashier?: string
  /** Payments recorded for the session so far — drives the ESPECES/CARTE
   * lines and the split-mode annotations. */
  payments?: Payment[]
  /** Promotion applied to the whole bill, in percent (20/30/40). */
  discount?: number
}

// TODO(client): supply Acua's real receipt footer — website, socials,
// tax/registration number and address. Placeholders for now.
const FOOTER = [
  'MERCI POUR VOTRE VISITE',
  'WWW.ACUA.ES',
  'INSTAGRAM:ACUA',
  'ACUA',
]

/** Sequential bill number for this till (T-1, T-2, …), device-local. */
function nextBillNo(): string {
  const n = (parseInt(localStorage.getItem('acua.billSeq') ?? '0', 10) || 0) + 1
  localStorage.setItem('acua.billSeq', String(n))
  return `T-${n}`
}

const kindNote = (k: Payment['kind']) =>
  k === 'equal' ? ' (part égale)' : k === 'items' ? ' (par article)' : ''

/** Items that were never sent to the kitchen are silently stripped from
 * the printed bill — they're draft lines the waiter didn't commit. */
const sentToKitchen = (i: OrderItem) => i.ticket_no != null

/** Customer bill: logo header, priced lines, TOTAL NET, payment/cashier
 * block, contact footer — the full till receipt. */
export function buildBill(
  tableRef: string,
  rawItems: OrderItem[],
  meta: BillMeta = {},
  cols = 42,
): Uint8Array {
  const items = rawItems.filter(sentToKitchen)
  const gross = items.reduce((t, i) => t + i.price * i.qty, 0)
  const discount = meta.discount ?? 0
  const total = gross * (1 - discount / 100)
  const p = new EscPos()

  // the bull emblem instead of the plain "ACUA" text header
  p.align('center').image(receiptLogoRaster(), RECEIPT_LOGO_WIDTH, RECEIPT_LOGO_HEIGHT)
  p.bold(false).line('RESTAURANT')
  if (isTakeout(tableRef)) {
    p.invert(true).bold(true).size(1, 1).line(' A EMPORTER ').size(0, 0).bold(false).invert(false)
  }
  p.align('left').rule(cols)

  for (const i of items) {
    p.line(lr(`${i.qty}  ${i.name.toUpperCase()}`, i.price === 0 ? '0.00' : (i.price * i.qty).toFixed(2), cols))
  }
  p.rule(cols)

  if (discount > 0) {
    p.line(lr('SOUS-TOTAL:', `${gross.toFixed(2)} €`, cols))
    // 100% = VIP: the whole order is offered
    const label = discount === 100 ? 'VIP (OFFERT):' : `REMISE -${discount}%:`
    p.bold(true).line(lr(label, `-${(gross - total).toFixed(2)} €`, cols)).bold(false)
  }
  p.bold(true).size(1, 1)
  p.line(lr('TOTAL NET:', `${total.toFixed(2)} €`, Math.floor(cols / 2)))
  p.size(0, 0).bold(false).rule(cols)

  const pays = meta.payments ?? []
  for (const pay of pays) {
    const label = pay.method === 'cash' ? 'ESPECES' : 'CARTE'
    p.line(`* ${label.padEnd(9)}: ${pay.amount.toFixed(2)} €${kindNote(pay.kind)}`)
  }
  if (meta.cashier) p.line(`* ${'CAISSIER'.padEnd(9)}: ${meta.cashier.toUpperCase()}`)
  p.line(`* ${'N° TICKET'.padEnd(9)}: ${nextBillNo()}`)
  p.line(`* ${'TABLE'.padEnd(9)}: ${tableRef}`)
  p.rule(cols)

  p.align('center')
  for (const l of FOOTER) p.line(l)
  p.feed(1).line(stamp()).align('left')
  p.cut()
  return p.bytes()
}

/* ------------------------------------------------------------------ *
 * Friend statement ("l'addition" for a friend settling their tab)     *
 * ------------------------------------------------------------------ */

export interface FriendStatementLine {
  /** Service day of the bill, "DD/MM/YYYY". */
  date: string
  /** What they had that day (comma-separated), may be empty. */
  detail: string
  amount: number
}

export interface FriendStatementData {
  friendName: string
  /** Human label for the period covered ("Tout" / "21/07 → 26/07" …). */
  periodLabel: string
  lines: FriendStatementLine[]
  total: number
  cashier: string
}

/** A friend's running tab, itemised by day — handed to the friend so they
 * see exactly what they're settling. Not a fiscal bill (no VAT footer): a
 * statement of an outstanding account. */
export function buildFriendStatement(d: FriendStatementData, cols = 42): Uint8Array {
  const p = new EscPos()
  p.align('center').image(receiptLogoRaster(), RECEIPT_LOGO_WIDTH, RECEIPT_LOGO_HEIGHT)
  p.bold(false).line('RESTAURANT')
  p.bold(true).size(0, 1).line('ADDITION AMI').size(0, 0).bold(false)
  p.line(d.friendName.toUpperCase())
  p.line(d.periodLabel)
  p.align('left').rule(cols)

  for (const l of d.lines) {
    p.line(lr(l.date, `${l.amount.toFixed(2)} €`, cols))
    if (l.detail) {
      // wrap the meal detail under the date so long orders stay readable
      const detail = l.detail.length > cols - 2 ? l.detail.slice(0, cols - 3) + '…' : l.detail
      p.line(`  ${detail}`)
    }
  }
  if (d.lines.length === 0) p.align('center').line('(rien à régler)').align('left')
  p.rule(cols)

  p.bold(true).size(1, 1)
  p.line(lr('TOTAL DU:', `${d.total.toFixed(2)} €`, Math.floor(cols / 2)))
  p.size(0, 0).bold(false).rule(cols)
  p.line(`* ${'CAISSIER'.padEnd(9)}: ${d.cashier.toUpperCase()}`)
  p.line(`* ${'EDITE LE'.padEnd(9)}: ${stamp()}`)
  p.rule(cols)
  p.align('center')
  for (const l of FOOTER) p.line(l)
  p.align('left')
  p.cut()
  return p.bytes()
}

/** Print a friend's statement on the cashier printer (browser falls back to
 * the OS dialog, same as the bill). */
export async function printFriendStatement(d: FriendStatementData): Promise<void> {
  const { cashierPrinterName, paperWidth } = usePrinter.getState()
  if (inTauri() && cashierPrinterName) {
    await sendToPrinter(cashierPrinterName, buildFriendStatement(d, columnsFor(paperWidth)))
    return
  }
  printFriendStatementHtml(d)
}

function printFriendStatementHtml(d: FriendStatementData) {
  const rows = d.lines
    .map(
      (l) => `<div style="display:flex;justify-content:space-between;gap:8px;font-size:13px;font-weight:600">
        <span>${esc(l.date)}</span><span>${l.amount.toFixed(2)} €</span></div>
      ${l.detail ? `<div style="font-size:11px;color:#333;padding-left:6px">${esc(l.detail)}</div>` : ''}`,
    )
    .join('')
  const html = `
    <div style="text-align:center"><img src="${RECEIPT_LOGO_PNG}" alt="ACUA" style="width:96px;height:96px" /></div>
    <div style="text-align:center;font-size:10px;letter-spacing:2px">RESTAURANT</div>
    <div style="text-align:center;font-weight:800;font-size:14px;margin-top:4px">ADDITION AMI</div>
    <div style="text-align:center;font-size:13px;font-weight:700">${esc(d.friendName)}</div>
    <div style="text-align:center;font-size:11px">${esc(d.periodLabel)}</div>
    <hr style="border:none;border-top:1px dashed #000;margin:6px 0" />
    ${rows || '<div style="text-align:center;font-size:12px">(rien à régler)</div>'}
    <hr style="border:none;border-top:1px dashed #000;margin:6px 0" />
    <div style="display:flex;justify-content:space-between;font-weight:800;font-size:15px"><span>TOTAL DÛ</span><span>${d.total.toFixed(2)} €</span></div>
    <div style="font-size:11px;margin-top:4px">* CAISSIER : ${esc(d.cashier.toUpperCase())}</div>
    <div style="font-size:11px">* ÉDITÉ LE : ${stamp()}</div>
    <div style="text-align:center;font-size:11px;margin-top:8px">${FOOTER.join('<br/>')}</div>`
  let root = document.getElementById('print-root')
  if (!root) {
    root = document.createElement('div')
    root.id = 'print-root'
    document.body.appendChild(root)
  }
  root.innerHTML = `<div class="ticket-print">${html}</div>`
  window.print()
}

/* ------------------------------------------------------------------ *
 * Relevé de ventes (sales report)                                     *
 * ------------------------------------------------------------------ */

export interface SalesReportLine {
  name: string
  qty: number
  rev: number
}

/** One staff order within a person's section. */
export interface SalesReportOrder {
  date: string // 'DD/MM HH:MM'
  items: string // 'Coca x2, Burger x1'
  amount: number
}

/** A staff-report section: one person, each of their orders (with dates),
 * their order count and their total. */
export interface SalesReportGroup {
  name: string
  count: number
  total: number
  orders: SalesReportOrder[]
}

export interface SalesReportData {
  /** "Jour" / "Semaine" / "Mois". */
  scopeLabel: string
  /** e.g. "21/07/2026" or "14/07 → 20/07". */
  periodLabel: string
  /** Which location this report covers, printed under the title. */
  branchLabel?: string
  /** Exact window covered, printed under the title. */
  fromLabel: string
  toLabel: string
  lines: SalesReportLine[]
  /** Staff report only: per-person breakdown. When set, printed instead of
   * the flat item list. */
  groups?: SalesReportGroup[]
  /** Total plats (food dishes) sold — matches the phone's "Plats vendus". */
  totalQty: number
  /** Sodas sold — matches the phone's "Sodas vendus". */
  sodasQty?: number
  totalRev: number
  cash: number
  card: number
  /** Friend tabs settled in the period — already folded into cash/card and
   * totalRev, surfaced as its own line so the till can see it. */
  friendSettlements?: number
  cashier: string
  /** Set when the report covers a period that is still running. */
  partial?: boolean
}

/**
 * Sales report: every item sold in the period with its quantity and
 * revenue, the totals, how the money came in, and who was on the till.
 * Deliberately plain and dense — it's an accounting document, not a bill.
 */
export function buildSalesReport(d: SalesReportData, cols = 42): Uint8Array {
  const p = new EscPos()
  // columns: name | qty(4) | total(10)
  const nameW = cols - 14

  p.align('center').image(receiptLogoRaster(), RECEIPT_LOGO_WIDTH, RECEIPT_LOGO_HEIGHT)
  p.bold(false).line('RESTAURANT')
  p.bold(true).size(0, 1).line('RELEVE DE VENTES').size(0, 0).bold(false)
  // branch band — makes it obvious this is one restaurant's day, not both
  if (d.branchLabel)
    p.bold(true).invert(true).line(` ${d.branchLabel.toUpperCase()} `).invert(false).bold(false)
  // The thermal charset can't render "→" (prints as "?"), so fold it to "->".
  p.line(`${d.scopeLabel} - ${d.periodLabel}`.replace(/→/g, '->'))
  p.line(`${d.fromLabel}  ->  ${d.toLabel}`)
  if (d.partial) p.bold(true).line('** PERIODE EN COURS **').bold(false)
  p.align('left').rule(cols)

  const itemLine = (l: SalesReportLine) => {
    const name = l.name.length > nameW - 1 ? l.name.slice(0, nameW - 1) : l.name
    p.line(`${name.toUpperCase().padEnd(nameW)}${String(l.qty).padStart(4)}${l.rev.toFixed(2).padStart(10)}`)
  }

  if (d.groups) {
    // staff report — one section per person, each order dated, with a count.
    // Name is bold + double-height (inverted white-on-black prints too faint
    // on thermal paper), separated by a rule so people are easy to tell apart.
    for (const g of d.groups) {
      const cmd = g.count === 1 ? '1 CMD' : `${g.count} CMD`
      p.rule(cols)
      p.bold(true).size(0, 1).line(g.name.toUpperCase()).size(0, 0)
      p.line(lr('', cmd, cols)).bold(false)
      for (const o of g.orders) {
        p.line(lr(o.date, o.amount.toFixed(2), cols))
        if (o.items) p.line(`  ${o.items}`)
      }
      p.bold(true).line(lr('  Total:', `${g.total.toFixed(2)} €`, cols)).bold(false)
      p.feed(1)
    }
    if (d.groups.length === 0) p.align('center').line('(aucune vente)').align('left')
  } else {
    p.bold(true).line(`${'ARTICLE'.padEnd(nameW)}${'QTE'.padStart(4)}${'TOTAL'.padStart(10)}`).bold(false)
    p.rule(cols)
    for (const l of d.lines) itemLine(l)
    if (d.lines.length === 0) p.align('center').line('(aucune vente)').align('left')
  }

  p.rule(cols)
  p.bold(true)
  p.line(lr('PLATS VENDUS:', String(d.totalQty), cols))
  if (d.sodasQty !== undefined) p.line(lr('SODAS:', String(d.sodasQty), cols))
  p.size(0, 1).line(lr('TOTAL VENTES:', `${d.totalRev.toFixed(2)} €`, cols)).size(0, 0)
  p.bold(false).rule(cols)

  p.bold(true).line('ENCAISSEMENTS').bold(false)
  p.line(`* ${'ESPECES'.padEnd(9)}: ${d.cash.toFixed(2)} €`)
  p.line(`* ${'CARTE'.padEnd(9)}: ${d.card.toFixed(2)} €`)
  if (d.friendSettlements)
    p.line(`* ${'DONT AMIS'.padEnd(9)}: ${d.friendSettlements.toFixed(2)} €`)
  p.bold(true).line(`* ${'TOTAL'.padEnd(9)}: ${(d.cash + d.card).toFixed(2)} €`).bold(false)
  p.rule(cols)

  p.line(`* ${'CAISSIER'.padEnd(9)}: ${d.cashier.toUpperCase()}`)
  p.line(`* ${'EDITE LE'.padEnd(9)}: ${stamp()}`)
  p.rule(cols)

  p.align('center')
  for (const l of FOOTER) p.line(l)
  p.align('left')
  p.cut()
  return p.bytes()
}

/** Print the sales report on the cashier printer (browser falls back to
 * the OS dialog, same as the bill). */
export async function printSalesReport(d: SalesReportData): Promise<void> {
  const { cashierPrinterName, paperWidth } = usePrinter.getState()
  const cols = columnsFor(paperWidth)
  if (inTauri() && cashierPrinterName) {
    await sendToPrinter(cashierPrinterName, buildSalesReport(d, cols))
    return
  }
  printSalesReportHtml(d)
}

function printSalesReportHtml(d: SalesReportData) {
  const itemRow = (l: SalesReportLine) =>
    `<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px">
        <span>${esc(l.name)}</span><span>${l.qty} · ${l.rev.toFixed(2)}</span></div>`
  const orderRow = (o: SalesReportOrder) =>
    `<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;font-weight:600;margin-top:3px">
        <span>${esc(o.date)}</span><span>${o.amount.toFixed(2)}</span></div>
     ${o.items ? `<div style="font-size:11px;color:#333;padding-left:6px">${esc(o.items)}</div>` : ''}`
  const rows = d.groups
    ? d.groups
        .map((g) => {
          const cmd = g.count === 1 ? '1 commande' : `${g.count} commandes`
          return `<div style="display:flex;justify-content:space-between;font-weight:800;font-size:12.5px;margin-top:8px;border-bottom:1px solid #000"><span>${esc(g.name)}</span><span>${cmd}</span></div>
          ${g.orders.map(orderRow).join('')}
          <div style="display:flex;justify-content:space-between;font-weight:700;font-size:12px;margin-top:2px"><span>Total</span><span>${g.total.toFixed(2)} €</span></div>`
        })
        .join('')
    : d.lines.map(itemRow).join('')
  const html = `
    <div style="text-align:center"><img src="${RECEIPT_LOGO_PNG}" alt="ACUA" style="width:96px;height:96px" /></div>
    <div style="text-align:center;font-size:10px;letter-spacing:2px">RESTAURANT</div>
    <div style="text-align:center;font-weight:800;font-size:14px;margin-top:4px">RELEVÉ DE VENTES</div>
    ${d.branchLabel ? `<div style="text-align:center;font-weight:800;font-size:12px;background:#000;color:#fff;padding:1px 0;margin:3px 0">${esc(d.branchLabel.toUpperCase())}</div>` : ''}
    <div style="text-align:center;font-size:12px">${esc(d.scopeLabel)} — ${esc(d.periodLabel)}</div>
    <div style="text-align:center;font-size:11px">${esc(d.fromLabel)} → ${esc(d.toLabel)}</div>
    ${d.partial ? '<div style="text-align:center;font-weight:700;font-size:11px">** PÉRIODE EN COURS **</div>' : ''}
    <hr style="border:none;border-top:1px dashed #000;margin:6px 0" />${rows}
    <hr style="border:none;border-top:1px dashed #000;margin:6px 0" />
    <div style="display:flex;justify-content:space-between;font-size:12px"><span>PLATS VENDUS</span><span>${d.totalQty}</span></div>
    ${d.sodasQty !== undefined ? `<div style="display:flex;justify-content:space-between;font-size:12px"><span>SODAS</span><span>${d.sodasQty}</span></div>` : ''}
    <div style="display:flex;justify-content:space-between;font-weight:800;font-size:14px"><span>TOTAL VENTES</span><span>${d.totalRev.toFixed(2)} €</span></div>
    <hr style="border:none;border-top:1px dashed #000;margin:6px 0" />
    <div style="font-size:11px">* ESPÈCES : ${d.cash.toFixed(2)} €</div>
    <div style="font-size:11px">* CARTE : ${d.card.toFixed(2)} €</div>
    ${d.friendSettlements ? `<div style="font-size:11px;color:#333">&nbsp;&nbsp;dont amis : ${d.friendSettlements.toFixed(2)} €</div>` : ''}
    <div style="font-size:11px;font-weight:700">* TOTAL : ${(d.cash + d.card).toFixed(2)} €</div>
    <div style="font-size:11px;margin-top:4px">* CAISSIER : ${esc(d.cashier.toUpperCase())}</div>
    <div style="font-size:11px">* ÉDITÉ LE : ${stamp()}</div>
    <div style="text-align:center;font-size:11px;margin-top:8px">${FOOTER.join('<br/>')}</div>`
  let root = document.getElementById('print-root')
  if (!root) {
    root = document.createElement('div')
    root.id = 'print-root'
    document.body.appendChild(root)
  }
  root.innerHTML = `<div class="ticket-print">${html}</div>`
  window.print()
}

/* ------------------------------------------------------------------ *
 * Manual bill print (cashier taps "print bill" on the Caisse device)  *
 * ------------------------------------------------------------------ */

/**
 * Which till's printer a bill comes out of. Both are Windows-installed
 * printers reached through the spooler — 'cashier' is the one cabled to the
 * main till, 'bar' the one cabled to the bar's till.
 */
export type BillStation = 'cashier' | 'bar'

/**
 * Print a customer bill. In the Caisse desktop app it goes straight to a
 * printer installed in Windows (the spooler — no network/IP involved).
 * Anywhere else (a browser, e.g. the admin "view bill" action) it falls back
 * to the OS print dialog so the feature still works off the till.
 *
 * `station` picks WHICH printer. Tables on the BAR floor print their
 * addition on the bar's own printer, so the barman hands the customer their
 * bill without walking to the main till; everything else prints at the
 * caisse. A bar bill falls back to the cashier printer when no bar printer
 * has been configured, so the bill is never simply lost.
 */
/** Print the customer bill. Returns the number of unsent items that were
 * stripped (0 when everything was sent to the kitchen). */
export async function printBill(
  tableRef: string,
  items: OrderItem[],
  meta: BillMeta = {},
  station: BillStation = 'cashier',
): Promise<number> {
  const stripped = items.filter((i) => !sentToKitchen(i) && !i.voided).length
  const { cashierPrinterName, barPrinterName, paperWidth } = usePrinter.getState()
  const target = station === 'bar' ? barPrinterName || cashierPrinterName : cashierPrinterName
  if (inTauri() && target) {
    await sendToPrinter(target, buildBill(tableRef, items, meta, columnsFor(paperWidth)))
    return stripped
  }
  printBillHtml(tableRef, items, meta)
  return stripped
}

/* ------------------------------------------------------------------ *
 * Browser fallback: render HTML + window.print() (non-Tauri only)     *
 * ------------------------------------------------------------------ */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function printBillHtml(tableRef: string, rawItems: OrderItem[], meta: BillMeta) {
  const items = rawItems.filter(sentToKitchen)
  const gross = items.reduce((t, i) => t + i.price * i.qty, 0)
  const discount = meta.discount ?? 0
  const total = gross * (1 - discount / 100)
  let body = ''
  for (const i of items) {
    body += `<div style="display:flex;justify-content:space-between;font-size:13px">
      <span>${i.qty}× ${esc(i.name)}</span><span>${money(i.price * i.qty)}</span></div>`
  }
  body += `<hr style="border:none;border-top:1px dashed #000;margin:6px 0" />`
  if (discount > 0) {
    body += `<div style="display:flex;justify-content:space-between;font-size:12px">
      <span>SOUS-TOTAL</span><span>${gross.toFixed(2)} €</span></div>
      <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700">
      <span>REMISE -${discount}%</span><span>-${(gross - total).toFixed(2)} €</span></div>`
  }
  body += `<div style="display:flex;justify-content:space-between;font-weight:800;font-size:14px">
    <span>TOTAL NET</span><span>${total.toFixed(2)} €</span></div>`
  for (const pay of meta.payments ?? []) {
    body += `<div style="font-size:11px">* ${pay.method === 'cash' ? 'ESPECES' : 'CARTE'} : ${pay.amount.toFixed(2)} €${esc(kindNote(pay.kind))}</div>`
  }
  if (meta.cashier) body += `<div style="font-size:11px">* CAISSIER : ${esc(meta.cashier.toUpperCase())}</div>`
  body += `<div style="font-size:11px">* TABLE : ${esc(tableRef)}</div>
    <div style="text-align:center;font-size:11px;margin-top:8px">${FOOTER.join('<br/>')}</div>`
  const html = `
    <div style="text-align:center"><img src="${RECEIPT_LOGO_PNG}" alt="ACUA" style="width:96px;height:96px" /></div>
    <div style="text-align:center;font-size:10px;letter-spacing:2px">RESTAURANT</div>
    ${isTakeout(tableRef) ? '<div style="text-align:center;font-weight:800;background:#000;color:#fff;padding:2px 0;margin:4px 0">À EMPORTER</div>' : ''}
    <div style="text-align:center">Table ${esc(tableRef)}</div>
    <div style="text-align:center;font-size:11px">${stamp()}</div>
    <hr style="border:none;border-top:1px dashed #000;margin:6px 0" />${body}`
  let root = document.getElementById('print-root')
  if (!root) {
    root = document.createElement('div')
    root.id = 'print-root'
    document.body.appendChild(root)
  }
  root.innerHTML = `<div class="ticket-print">${html}</div>`
  window.print()
}
