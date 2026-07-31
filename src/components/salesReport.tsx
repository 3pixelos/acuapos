import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Clock, Printer, ShieldCheck, XCircle } from 'lucide-react'
import { Btn, Modal } from './ui'
import { supabase } from '../lib/supabase'
import { useAuth, scopedBranch, deviceBranch } from '../state/auth'
import { BRANCH_LABEL } from '../lib/types'
import { useI18n } from '../lib/i18n'
import {
  printSalesReport,
  type SalesReportData,
  type SalesReportGroup,
  type SalesReportLine,
  type SalesReportOrder,
} from '../lib/print'
import { classifyItem } from '../lib/dishCats'
import {
  completedMonths,
  completedWeeks,
  dayPeriod,
  rangePeriod,
  todayKey,
  type ReportPeriod,
  type ReportScope,
} from '../lib/serviceDay'
import {
  markSalesReportPrinted,
  requestSalesReport,
  type ReportRequest,
} from '../state/actions'

/* ------------------------------------------------------------------ *
 * Caisse: request authorisation, then print the "Relevé de ventes"    *
 * ------------------------------------------------------------------ */

/** Live view of this cashier's most recent request for a given period. */
function useMyRequest(periodKey: string, staffId: string) {
  const [req, setReq] = useState<ReportRequest | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      const { data } = await supabase
        .from('report_requests')
        .select('*')
        .eq('requested_by', staffId)
        .eq('period_key', periodKey)
        .order('created_at', { ascending: false })
        .limit(1)
      if (alive) setReq(((data ?? [])[0] as ReportRequest) ?? null)
    }
    void load()
    // the admin's decision must land here without a refresh
    const ch = supabase
      .channel(`report-${periodKey}-${staffId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'report_requests' }, () =>
        void load(),
      )
      .subscribe()
    const poll = setInterval(load, 5000) // fallback if the socket dies
    return () => {
      alive = false
      clearInterval(poll)
      void supabase.removeChannel(ch)
    }
  }, [periodKey, staffId])

  return { req, setReq }
}

export function SalesReportModal({ onClose }: { onClose: () => void }) {
  const user = useAuth((s) => s.user)!
  const t = useI18n((s) => s.t)
  const [scope, setScope] = useState<ReportScope>('day')
  const [day, setDay] = useState(todayKey())
  const [rangeFrom, setRangeFrom] = useState(todayKey())
  const [rangeTo, setRangeTo] = useState(todayKey())
  const [staffOnly, setStaffOnly] = useState(false)
  const weeks = useMemo(() => completedWeeks(), [])
  const months = useMemo(() => completedMonths(), [])
  const [weekKey, setWeekKey] = useState(weeks[0]?.key ?? '')
  const [monthKey, setMonthKey] = useState(months[0]?.key ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const period: ReportPeriod =
    scope === 'day'
      ? dayPeriod(day)
      : scope === 'custom'
        ? rangePeriod(rangeFrom, rangeTo)
        : scope === 'week'
          ? (weeks.find((w) => w.key === weekKey) ?? weeks[0])
          : (months.find((m) => m.key === monthKey) ?? months[0])

  // staff report is a distinct authorisation (own key), so it never
  // collides with a normal report for the same period.
  const reqKey = `${staffOnly ? 'staff-' : ''}${period?.key ?? ''}`
  const { req, setReq } = useMyRequest(reqKey, user.id)

  const ask = async () => {
    setBusy(true)
    setErr('')
    const r = await requestSalesReport(
      user.id,
      user.name,
      period.scope,
      reqKey,
      `${staffOnly ? `${t('staffReport')} · ` : ''}${t(`report_${period.scope}`)} — ${period.label}`,
    )
    setBusy(false)
    if (!r) return setErr(t('reportRequestFailed'))
    setReq(r)
  }

  const doPrint = async () => {
    if (!req) return
    setBusy(true)
    setErr('')
    try {
      const data = await buildReportData(
        period,
        user.name,
        staffOnly ? t('staffReport') : t(`report_${period.scope}`),
        staffOnly,
      )
      await printSalesReport(data)
      await markSalesReportPrinted(req, user.id)
      setReq({ ...req, status: 'printed' })
      onClose()
    } catch (e) {
      console.error('[report] print failed:', e)
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  const field =
    'min-h-12 w-full rounded-xl border border-line-2 bg-surface-2 px-3.5 outline-none focus:border-accent'

  return (
    <Modal onClose={onClose}>
      <h2 className="flex items-center gap-2 text-lg font-bold">
        {t('salesReport')}
      </h2>
      <p className="mt-1 text-[13px] text-ink-3">{t('salesReportHint')}</p>

      {/* staff toggle: switch the whole report to staff meals only */}
      <button
        onClick={() => setStaffOnly((v) => !v)}
        className={`mt-4 flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-[13.5px] font-bold transition-all ${
          staffOnly ? 'border-transparent bg-indigo-600 text-white' : 'border-line-2 bg-surface-2 text-ink-2'
        }`}
      >
        <span>{t('staffReport')}</span>
        <span className={`grid size-5 place-items-center rounded-full ${staffOnly ? 'bg-white/25' : 'bg-line'}`}>
          {staffOnly ? '✓' : ''}
        </span>
      </button>

      {/* scope */}
      <div className="mt-3 flex rounded-full bg-surface-2 p-1">
        {(['day', 'week', 'month', 'custom'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={`min-h-9 flex-1 rounded-full text-[12.5px] font-semibold transition-all ${
              scope === s ? 'bg-surface shadow-(--shadow-1)' : 'text-ink-3'
            }`}
          >
            {t(`report_${s}`)}
          </button>
        ))}
      </div>

      {/* period picker */}
      <div className="mt-3">
        {scope === 'day' && (
          <input
            type="date"
            className={field}
            value={day}
            max={todayKey()}
            onChange={(e) => e.target.value && setDay(e.target.value)}
          />
        )}
        {scope === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              className={field}
              value={rangeFrom}
              max={todayKey()}
              onChange={(e) => e.target.value && setRangeFrom(e.target.value)}
            />
            <span className="text-ink-3">→</span>
            <input
              type="date"
              className={field}
              value={rangeTo}
              max={todayKey()}
              onChange={(e) => e.target.value && setRangeTo(e.target.value)}
            />
          </div>
        )}
        {scope === 'week' && (
          <select className={field} value={weekKey} onChange={(e) => setWeekKey(e.target.value)}>
            {weeks.map((w) => (
              <option key={w.key} value={w.key}>
                {w.label}
              </option>
            ))}
          </select>
        )}
        {scope === 'month' && (
          <select className={field} value={monthKey} onChange={(e) => setMonthKey(e.target.value)}>
            {months.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        )}
        {scope !== 'day' && (
          <p className="mt-1.5 text-[12px] text-ink-3">{t('reportClosedOnly')}</p>
        )}
      </div>

      {/* authorisation state */}
      <div className="mt-4">
        {!req || req.status === 'printed' || req.status === 'denied' ? (
          <>
            {req?.status === 'denied' && (
              <p className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-danger">
                <XCircle size={15} /> {t('reportDenied')}
              </p>
            )}
            <Btn variant="primary" className="w-full" disabled={busy} onClick={ask}>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck size={16} /> {t('reportAsk')}
              </span>
            </Btn>
          </>
        ) : req.status === 'pending' ? (
          <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3.5 py-3 text-[13px] font-semibold text-amber-800">
            <Clock size={16} className="shrink-0" /> {t('reportPending')}
          </div>
        ) : (
          <>
            <p className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-st-served">
              <CheckCircle2 size={15} /> {t('reportApproved')}
            </p>
            <Btn variant="primary" className="w-full" disabled={busy} onClick={doPrint}>
              <span className="inline-flex items-center gap-1.5">
                <Printer size={16} /> {t('reportPrint')}
              </span>
            </Btn>
          </>
        )}
        {err && <p className="mt-2 text-[12px] text-danger">{err}</p>}
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ *
 * Aggregation: everything sold in the window                          *
 * ------------------------------------------------------------------ */

const p2 = (n: number) => String(n).padStart(2, '0')
/** Full date for the header window, no time: "22/07/2026". */
const fmtDate = (d: Date) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`
/** Short date for an order line, no time: "22/07". */
const fmtShort = (d: Date) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`
/** The last service day actually included: period.to is the EXCLUSIVE 05:00
 * boundary of the day after, so step back 24h to land on the chosen end. */
const inclusiveEnd = (period: ReportPeriod) => new Date(period.to.getTime() - 86400_000)

export async function buildReportData(
  period: ReportPeriod,
  cashier: string,
  scopeLabel: string,
  staffOnly = false,
): Promise<SalesReportData> {
  // The relevé (the "fin de journée") is scoped to the till's location:
  // the signed-in cashier's own location, falling back to this device's bound
  // location. Applies to BOTH this normal report and the staff report below.
  const branch = scopedBranch() ?? deviceBranch()
  let sessQ = supabase
    .from('table_sessions')
    .select('id, closed_at, discount, staff_order, vip_name, order_items(*), payments(*)')
    .not('closed_at', 'is', null)
    .eq('cancelled', false)
    .gte('closed_at', period.from.toISOString())
    .lt('closed_at', period.to.toISOString())
  if (branch) sessQ = sessQ.eq('branch', branch)
  // Classify items the same way the phone analytics do, so "PLATS VENDUS"
  // on the receipt matches "Plats vendus" on the dashboard.
  const [{ data }, { data: catData }, { data: menuData }] = await Promise.all([
    sessQ,
    supabase.from('menu_categories').select('id, name_fr, main'),
    supabase.from('menu_items').select('id, category_id'),
  ])

  type Cat = { id: string; name_fr: string; main: string }
  type MenuItem = { id: string; category_id: string }
  const cats = (catData ?? []) as Cat[]
  const menu = (menuData ?? []) as MenuItem[]
  const catById = new Map(cats.map((c) => [c.id, c]))
  const catByFr = new Map(cats.map((c) => [c.name_fr, c]))
  const menuById = new Map(menu.map((m) => [m.id, m]))
  const kindOf = (i: OrderItem) => classifyItem(i, menuById, catById, catByFr)

  type OrderItem = {
    name: string
    qty: number
    price: number
    voided: boolean
    menu_item_id: string | null
    category: string | null
  }
  type Row = {
    closed_at: string
    discount: number | null
    staff_order: boolean | null
    vip_name: string | null
    order_items: OrderItem[]
    payments: { method: 'cash' | 'card'; amount: number }[]
  }
  // Staff report: only the staff meals. Normal report: everything.
  const rows = ((data ?? []) as Row[]).filter((r) => (staffOnly ? r.staff_order === true : true))

  // Friend tabs SETTLED in this window (by pay date) are real money taken in
  // today, so they belong in the day's encaissements — booked on the day the
  // friend paid, in the method they paid. Excluded from the staff report.
  let friendCash = 0
  let friendCard = 0
  if (!staffOnly) {
    let fq = supabase
      .from('friend_debts')
      .select('amount, method, settled_at')
      .eq('settled', true)
      .not('settled_at', 'is', null)
      .gte('settled_at', period.from.toISOString())
      .lt('settled_at', period.to.toISOString())
    if (branch) fq = fq.eq('branch', branch)
    const { data: fd } = await fq
    for (const d of (fd ?? []) as { amount: number; method: 'cash' | 'card' }[]) {
      if (d.method === 'card') friendCard += d.amount
      else friendCash += d.amount
    }
  }
  const friendSettlements = friendCash + friendCard
  // plats / sodas counts (across all rows in scope), matching the analytics
  let platsQty = 0
  let sodasQty = 0
  for (const r of rows)
    for (const i of r.order_items) {
      if (i.voided) continue
      const k = kindOf(i)
      if (k === 'plat') platsQty += i.qty
      else if (k === 'soda') sodasQty += i.qty
    }

  const meta = {
    scopeLabel,
    periodLabel: period.label,
    fromLabel: fmtDate(period.from),
    toLabel: fmtDate(inclusiveEnd(period)),
    cashier,
    // printed on the ticket so it's unmistakable which restaurant this
    // fin-de-journée covers (empty only for an unscoped admin, who has no till)
    branchLabel: branch ? BRANCH_LABEL[branch] : '',
    partial: period.to.getTime() > Date.now(),
  }

  // The staff name lives in vip_name (a session is VIP or Staff, never both).
  // apply the session remise to REVENUE (staff -40%) so it matches what was
  // charged; quantities stay full (the food was made).
  const netOf = (r: Row) => 1 - (r.discount ?? 0) / 100

  if (staffOnly) {
    // one section per staff person, each of their orders dated + a count
    type Acc = { orders: SalesReportOrder[]; total: number; qty: number }
    const byPerson = new Map<string, Acc>()
    let cash = 0
    let card = 0
    // newest order first — sort by the real timestamp (the "DD/MM" label
    // can't be string-compared across months).
    const ordered = [...rows].sort((a, b) => (a.closed_at < b.closed_at ? 1 : -1))
    for (const r of ordered) {
      const person = (r.vip_name ?? '').trim() || 'Staff'
      const acc = byPerson.get(person) ?? { orders: [], total: 0, qty: 0 }
      byPerson.set(person, acc)
      const netF = netOf(r)
      const items = r.order_items.filter((i) => !i.voided)
      const amount = items.reduce((s, i) => s + i.price * i.qty * netF, 0)
      const label = items.map((i) => `${i.qty}x ${i.name}`).join(', ')
      acc.orders.push({ date: fmtShort(new Date(r.closed_at)), items: label, amount })
      acc.total += amount
      acc.qty += items.reduce((s, i) => s + i.qty, 0)
      for (const p of r.payments) {
        if (p.method === 'cash') cash += p.amount
        else card += p.amount
      }
    }
    const groups: SalesReportGroup[] = [...byPerson.entries()]
      .map(([name, acc]) => ({
        name,
        count: acc.orders.length,
        total: acc.total,
        orders: acc.orders, // already newest-first from the sorted rows
      }))
      .sort((a, b) => b.total - a.total)
    const totalRev = groups.reduce((s, g) => s + g.total, 0)
    return { ...meta, lines: [], groups, totalQty: platsQty, sodasQty, totalRev, cash, card }
  }

  const agg = new Map<string, SalesReportLine>()
  let cash = 0
  let card = 0
  for (const r of rows) {
    const netF = netOf(r)
    for (const i of r.order_items) {
      if (i.voided) continue
      const cur = agg.get(i.name) ?? { name: i.name, qty: 0, rev: 0 }
      cur.qty += i.qty
      cur.rev += i.price * i.qty * netF
      agg.set(i.name, cur)
    }
    for (const p of r.payments) {
      if (p.method === 'cash') cash += p.amount
      else card += p.amount
    }
  }

  const lines = [...agg.values()].sort((a, b) => b.qty - a.qty || b.rev - a.rev)
  return {
    ...meta,
    lines,
    totalQty: platsQty,
    sodasQty,
    // include friend settlements collected today in the money figures so the
    // relevé's total matches what actually went through the till
    totalRev: lines.reduce((s, l) => s + l.rev, 0) + friendSettlements,
    cash: cash + friendCash,
    card: card + friendCard,
    friendSettlements: friendSettlements || undefined,
  }
}

/* ------------------------------------------------------------------ *
 * Admin: pending authorisations                                       *
 * ------------------------------------------------------------------ */

/** Live list of requests awaiting an admin decision. */
export function usePendingReports() {
  const [rows, setRows] = useState<ReportRequest[]>([])

  useEffect(() => {
    let alive = true
    const load = async () => {
      const { data } = await supabase
        .from('report_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (alive) setRows((data ?? []) as ReportRequest[])
    }
    void load()
    const ch = supabase
      .channel('report-requests-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'report_requests' }, () =>
        void load(),
      )
      .subscribe()
    const poll = setInterval(load, 8000)
    return () => {
      alive = false
      clearInterval(poll)
      void supabase.removeChannel(ch)
    }
  }, [])

  return { rows, reload: () => setRows((r) => r) }
}

/** Small helper so the admin banner can show what's being asked for. */
export const reportSummary = (r: ReportRequest) => `${r.requester_name} · ${r.period_label}`

