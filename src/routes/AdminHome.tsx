import { useEffect, useMemo, useState } from 'react'
import {
  Banknote,
  Bell,
  Crown,
  BarChart3,
  CalendarDays,
  CreditCard,
  FileText,
  CalendarRange,
  ChevronRight,
  ClipboardList,
  LayoutGrid,
  Package,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  ScrollText,
  UtensilsCrossed,
  Trash2,
  Users,
  Wallet,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { TopBar, type NavTab } from '../components/TopBar'
import { buildTileViews, FloorMap, useNow } from '../components/FloorMap'
import { AvailabilityManager } from '../components/stock'
import { usePendingReports } from '../components/salesReport'
import { Btn, LayerSwitcher, Legend, Modal, StatusChip } from '../components/ui'
import { supabase } from '../lib/supabase'
import { printBill } from '../lib/print'
import { dateLabel, money } from '../lib/format'
import { useI18n, type TKey } from '../lib/i18n'
import { useData } from '../state/data'
import { businessDayStart, DAY_START_HOUR, dayPeriod, localDay, todayKey } from '../lib/serviceDay'
import { FOOD_MAINS, EXTRA_CATS_FR, SODA_CAT_FR } from '../lib/dishCats'
import type {
  ActivityLog,
  Branch,
  BranchScope,
  Friend,
  FriendDebt,
  LayerId,
  OrderItem,
  Payment,
  RestaurantTable,
  Role,
  Staff,
  TableSession,
} from '../lib/types'
import { BRANCH_LABEL, BRANCH_LAYERS, labelsFor, visualStatus } from '../lib/types'
import { useAuth } from '../state/auth'
import {
  confirmCancelSession,
  createFriend,
  decideSalesReport,
  removeFriend,
  renameFriend,
  rejectCancelSession,
  type ReportRequest,
} from '../state/actions'
import {
  enablePush,
  isIOS,
  isStandalone,
  pushPermission,
  pushSupported,
  type EnableResult,
} from '../lib/push'

const payKindKey: Record<Payment['kind'], TKey> = {
  full: 'payFull',
  equal: 'paySplitEqual',
  items: 'payByItems',
}

type Tab = 'map' | 'analytics' | 'dishes' | 'friends' | 'orders' | 'stock' | 'staff' | 'journal'

/* ---------------- location scope ---------------- *
 * Single-location Acua: there is one restaurant, so there is no branch
 * switcher. Tabs that act on a concrete location (map, stock) get 'main';
 * the rest read unscoped (`null`), which resolves to the same one location. */
const SCOPES: Record<Tab, BranchScope> = {
  map: 'main',
  stock: 'main',
  analytics: null,
  dishes: null,
  friends: null,
  orders: null,
  staff: null,
  journal: null,
}

export function AdminHome() {
  const [tab, setTab] = useState<Tab>('map')
  const scopes = SCOPES
  const t = useI18n((s) => s.t)

  const tabDefs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'map', label: t('roomMap'), icon: <LayoutGrid size={16} /> },
    { id: 'analytics', label: t('analytics'), icon: <BarChart3 size={16} /> },
    { id: 'dishes', label: t('dishesTab'), icon: <UtensilsCrossed size={16} /> },
    { id: 'friends', label: t('friendsTab'), icon: <Wallet size={16} /> },
    { id: 'orders', label: t('orders'), icon: <ReceiptText size={16} /> },
    { id: 'stock', label: t('stockTab'), icon: <Package size={16} /> },
    { id: 'staff', label: t('staffTab'), icon: <Users size={16} /> },
    { id: 'journal', label: t('journal'), icon: <ScrollText size={16} /> },
  ]
  const navTabs: NavTab[] = tabDefs.map((x) => ({
    id: x.id,
    label: x.label,
    icon: x.icon,
    active: tab === x.id,
    onClick: () => setTab(x.id),
  }))

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar section="Administration" tabs={navTabs} />
      {/* on mobile the same tabs live in the sidebar (see TopBar) */}
      <nav className="sticky top-[57px] z-20 hidden border-b border-line bg-surface/85 backdrop-blur-md sm:block">
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 py-1.5">
          {tabDefs.map((x) => (
            <button
              key={x.id}
              onClick={() => setTab(x.id)}
              className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition-all duration-150 ${
                tab === x.id ? 'bg-accent text-white' : 'text-ink-2 hover:bg-surface-2'
              }`}
            >
              {x.icon}
              {x.label}
            </button>
          ))}
        </div>
      </nav>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4">
        <PushEnable />
        {/* sits above every tab: a caisse waiting on a print authorisation
            must be seen wherever the admin happens to be */}
        <ReportApprovals />
        {tab === 'map' && <LiveMap branch={scopes.map} />}
        {tab === 'analytics' && <Analytics branch={scopes.analytics} />}
        {tab === 'dishes' && <DishInsights branch={scopes.dishes} />}
        {tab === 'friends' && <FriendsAdmin branch={scopes.friends} />}
        {tab === 'orders' && <OrdersList branch={scopes.orders} />}
        {tab === 'stock' && (
          <div className="mx-auto max-w-2xl">
            <p className="mb-3 text-[13px] text-ink-3">{t('branchSharedPrices')}</p>
            <AvailabilityManager branch={scopes.stock ?? 'main'} />
          </div>
        )}
        {tab === 'staff' && <StaffManager branch={scopes.staff} />}
        {tab === 'journal' && <Journal branch={scopes.journal} />}
      </main>
    </div>
  )
}

/* ---------------- push notifications (admin) ---------------- */
/** Lets the admin turn on Web Push on THIS device so cancellations and
 * print requests alert the phone even when the app is closed. Hidden once
 * granted. On an iOS Safari tab it shows the "add to home screen" step,
 * since iOS only delivers push to the installed PWA. */
function PushEnable() {
  const admin = useAuth((s) => s.user)!
  const t = useI18n((s) => s.t)
  const [result, setResult] = useState<EnableResult | 'busy' | null>(null)

  // Already on, or a browser with no push at all → show nothing.
  if (result === 'ok' || pushPermission() === 'granted') return null
  if (!pushSupported() && !isIOS()) return null

  const banner = (content: React.ReactNode) => (
    <div className="mb-4 flex flex-col items-start gap-2.5 rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      {content}
    </div>
  )

  // iOS must be launched from the home-screen icon to subscribe.
  if ((isIOS() && !isStandalone()) || result === 'not-standalone') {
    return banner(
      <span className="inline-flex items-start gap-2 text-[13px] font-semibold text-ink-2">
        <Bell size={16} className="mt-px shrink-0 text-accent" /> {t('notifInstallHint')}
      </span>,
    )
  }
  if (pushPermission() === 'denied' || result === 'denied') {
    return banner(
      <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-danger">
        <Bell size={16} className="shrink-0" /> {t('notifDenied')}
      </span>,
    )
  }

  return banner(
    <>
      <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink-2">
        <Bell size={16} className="shrink-0 text-accent" /> {t('notifHint')}
      </span>
      <Btn
        variant="primary"
        className="shrink-0"
        disabled={result === 'busy'}
        onClick={async () => {
          setResult('busy')
          setResult(await enablePush(admin.id))
        }}
      >
        {t('notifEnable')}
      </Btn>
    </>,
  )
}

/* ---------------- sales-report authorisations ---------------- */
/** Banner listing caisse requests to print a "Relevé de ventes". Approving
 * unlocks the print button on the till for that exact period. */
function ReportApprovals() {
  const user = useAuth((s) => s.user)!
  const t = useI18n((s) => s.t)
  const { rows } = usePendingReports()
  const [busy, setBusy] = useState<string | null>(null)
  if (rows.length === 0) return null

  const decide = async (r: ReportRequest, approve: boolean) => {
    setBusy(r.id)
    await decideSalesReport(r, user.id, approve)
    setBusy(null)
  }

  return (
    <div className="anim-fade mb-4 flex flex-col gap-2">
      {rows.map((r) => (
        <div
          key={r.id}
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3"
        >
          <FileText size={17} className="shrink-0 text-amber-700" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-bold text-amber-900">
              {t('reportRequestTitle')}
            </span>
            <span className="block truncate text-[12.5px] text-amber-800">
              {r.requester_name} · {r.period_label}
              {/* which till asked — the admin approves for both branches */}
              {r.branch && ` · ${BRANCH_LABEL[r.branch]}`}
            </span>
          </span>
          <span className="flex shrink-0 gap-2">
            <Btn disabled={busy === r.id} onClick={() => decide(r, false)}>
              {t('reportDeny')}
            </Btn>
            <Btn variant="primary" disabled={busy === r.id} onClick={() => decide(r, true)}>
              {t('reportApprove')}
            </Btn>
          </span>
        </div>
      ))}
    </div>
  )
}

/* ---------------- live map ---------------- */
/* Read-only, with one exception: tables in "cancel_pending" (caisse asked
 * to cancel) open a confirm dialog — the admin types the admin PIN and
 * either confirms the cancellation or sends the table back to service. */
const ADMIN_APPROVE_PIN = '0000'

function LiveMap({ branch }: { branch: BranchScope }) {
  const user = useAuth((s) => s.user)!
  const { tables, sessions, items, staff } = useData()
  const now = useNow()
  const t = useI18n((s) => s.t)
  const [layer, setLayer] = useState<LayerId>(BRANCH_LAYERS.main[0])
  const [confirmFor, setConfirmFor] = useState<TableSession | null>(null)
  const [secret, setSecret] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  // Single-location: always the one 'main' room set (`?? 'main'` only guards
  // a stale null).
  const shown = branch ?? 'main'
  // Keep the layer on a room the location actually has, else snap to its
  // first room (avoids an empty map with no way back).
  useEffect(() => {
    if (!BRANCH_LAYERS[shown].includes(layer)) setLayer(BRANCH_LAYERS[shown][0])
  }, [shown, layer])
  const branchTables = useMemo(() => tables.filter((tb) => tb.branch === shown), [tables, shown])
  const branchSessions = useMemo(() => sessions.filter((s) => s.branch === shown), [sessions, shown])
  const views = useMemo(
    () =>
      buildTileViews(
        branchTables.filter((tb) => tb.layer === layer).sort((a, b) => a.sort - b.sort),
        branchTables,
        branchSessions,
        items,
        staff,
        now,
      ),
    [branchTables, branchSessions, items, staff, now, layer],
  )

  const closeConfirm = () => {
    setConfirmFor(null)
    setSecret('')
    setErr('')
  }
  const decide = async (confirm: boolean) => {
    if (!confirmFor) return
    setBusy(true)
    setErr('')
    if (secret !== ADMIN_APPROVE_PIN) {
      setBusy(false)
      setErr(t('badPin'))
      return
    }
    if (confirm) await confirmCancelSession(confirmFor, user.id)
    else await rejectCancelSession(confirmFor, user.id)
    setBusy(false)
    closeConfirm()
  }

  return (
    <div className="flex h-full min-h-120 flex-col gap-3">
      <LayerSwitcher layer={layer} setLayer={setLayer} branch={shown} />
      <Legend />
      <FloorMap
        views={views}
        showWaiter
        onTap={(v) => {
          if (v.session?.cancel_requested) setConfirmFor(v.session)
        }}
      />
      {confirmFor && (
        <Modal onClose={closeConfirm}>
          <h2 className="text-lg font-bold">
            {t('confirmCancelTitle')} — {labelsFor(tables, confirmFor.table_ids)}
          </h2>
          {confirmFor.cancel_reason && (
            <p className="mt-2 text-sm text-ink-2">» {confirmFor.cancel_reason}</p>
          )}
          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-bold text-ink-2">{t('adminPin')}</span>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="••••"
              value={secret}
              onChange={(e) => {
                setErr('')
                setSecret(e.target.value.replace(/\D/g, ''))
              }}
              className="min-h-12 w-full rounded-xl border border-line-2 bg-surface-2 px-3.5 text-center text-[18px] font-bold tracking-[0.5em] outline-none focus:border-accent"
            />
          </label>
          {err && <p className="mt-2 text-[13px] font-semibold text-danger">{err}</p>}
          <div className="mt-5 flex gap-2.5">
            <Btn className="flex-1" disabled={busy || secret.length < 4} onClick={() => decide(false)}>
              {t('rejectCancel')}
            </Btn>
            <Btn variant="danger" className="flex-1" disabled={busy || secret.length < 4} onClick={() => decide(true)}>
              {t('confirmCancelTitle')}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ---------------- period + history fetching ---------------- */
type Period =
  | { kind: 'day' }
  | { kind: 'week' }
  | { kind: 'month' }
  | { kind: 'all' } // everything since opening (analytics only)
  | { kind: 'date'; date: string } // specific YYYY-MM-DD
  | { kind: 'pick'; month: string } // specific YYYY-MM
  | { kind: 'range'; from: string; to: string } // custom span, both YYYY-MM-DD inclusive

/** The restaurant closes late, so a service day runs 02:00 → 02:00 rather
 * than midnight → midnight: a table paid at 01:00 belongs to the night that
 * just ended, not to the new calendar date. Every date-based figure — the
 * "day" preset, a picked day/month, the daily chart, the launch-day
 * override — goes through this 3am boundary so they all agree. */
// DAY_START_HOUR / businessDayStart / localDay live in lib/serviceDay

function periodRange(p: Period): [Date, Date] {
  const now = new Date()
  if (p.kind === 'day') return [businessDayStart(now), now]
  if (p.kind === 'week') return [new Date(now.getTime() - 7 * 86400_000), now]
  if (p.kind === 'all') return [new Date(2020, 0, 1), now]
  if (p.kind === 'date') {
    const [y, m, d] = p.date.split('-').map(Number)
    // the picked day's service window: that day 02:00 → next day 02:00
    return [new Date(y, m - 1, d, DAY_START_HOUR), new Date(y, m - 1, d + 1, DAY_START_HOUR)]
  }
  if (p.kind === 'pick') {
    const [y, m] = p.month.split('-').map(Number)
    return [new Date(y, m - 1, 1, DAY_START_HOUR), new Date(y, m, 1, DAY_START_HOUR)]
  }
  if (p.kind === 'range') {
    // both ends inclusive: from-day 05:00 → (to-day + 1) 05:00
    const [fy, fm, fd] = p.from.split('-').map(Number)
    const [ty, tm, td] = p.to.split('-').map(Number)
    let a = new Date(fy, fm - 1, fd, DAY_START_HOUR)
    let b = new Date(ty, tm - 1, td + 1, DAY_START_HOUR)
    if (a > b) [a, b] = [b, a] // tolerate reversed pick
    return [a, b]
  }
  return [new Date(now.getFullYear(), now.getMonth(), 1, DAY_START_HOUR), now]
}

const periodKey = (p: Period) =>
  p.kind === 'date'
    ? `date:${p.date}`
    : p.kind === 'pick'
      ? `pick:${p.month}`
      : p.kind === 'range'
        ? `range:${p.from}:${p.to}`
        : p.kind

interface HistorySession extends TableSession {
  order_items: OrderItem[]
  payments: Payment[]
}

function useHistory(period: Period, branch: BranchScope = null) {
  const [rows, setRows] = useState<HistorySession[]>([])
  // `loading` drives the placeholder, so it must ONLY be true on the very
  // first fetch. Background refreshes swap the data in silently — flipping
  // it on every poll unmounted the charts for a frame and made the whole
  // screen flicker.
  const [loaded, setLoaded] = useState(false)

  // The store hands out a NEW sessions array on every 20s poll, so watching
  // the array itself refetched constantly. Watch a content signature
  // instead: refetch only when a session actually opens, closes, changes
  // status or gets a discount.
  const sessionsKey = useData((s) =>
    s.sessions.map((x) => `${x.id}:${x.status}:${x.closed_at ?? ''}:${x.discount ?? 0}`).join('|'),
  )

  useEffect(() => {
    let alive = true
    const [from, to] = periodRange(period)
    let q = supabase
      .from('table_sessions')
      .select('*, order_items(*), payments(*)')
      .not('closed_at', 'is', null)
      .eq('cancelled', false)
      .gte('closed_at', from.toISOString())
      .lte('closed_at', to.toISOString())
    // null branch = the combined total across both branches
    if (branch) q = q.eq('branch', branch)
    q.order('closed_at', { ascending: false }).then(({ data }) => {
      if (!alive) return
      setRows((data ?? []) as HistorySession[])
      setLoaded(true)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodKey(period), sessionsKey, branch])

  return { rows, loading: !loaded }
}

const sessTotal = (s: HistorySession) =>
  s.order_items.filter((i) => !i.voided).reduce((t, i) => t + i.price * i.qty, 0)

function PeriodBar({
  period,
  setPeriod,
  withAll = false,
}: {
  period: Period
  setPeriod: (p: Period) => void
  /** Adds the "all time" preset — analytics only. */
  withAll?: boolean
}) {
  const t = useI18n((s) => s.t)
  const presets: { id: 'day' | 'week' | 'month' | 'all'; label: string }[] = [
    { id: 'day', label: t('day') },
    { id: 'week', label: t('week') },
    { id: 'month', label: t('month') },
    ...(withAll ? ([{ id: 'all', label: t('allTime') }] as const) : []),
  ]
  const today = new Date().toISOString().slice(0, 10)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-full bg-surface-2 p-1">
        {presets.map((o) => (
          <button
            key={o.id}
            onClick={() => setPeriod({ kind: o.id })}
            className={`min-h-9 rounded-full px-4 text-[13px] font-semibold transition-all ${
              period.kind === o.id ? 'bg-surface shadow-(--shadow-1)' : 'text-ink-3'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {/* specific day */}
      <label
        className={`flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold ${
          period.kind === 'date' ? 'border-accent text-ink' : 'border-line text-ink-3'
        }`}
      >
        <CalendarDays size={14} />
        <span className="hidden sm:inline">{t('specificDay')}</span>
        <input
          type="date"
          aria-label={t('specificDay')}
          value={period.kind === 'date' ? period.date : ''}
          max={today}
          onChange={(e) => e.target.value && setPeriod({ kind: 'date', date: e.target.value })}
          className="bg-transparent outline-none"
        />
      </label>
      {/* specific month (past ones allowed) — dropdown, not a native date picker */}
      <label
        className={`flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold ${
          period.kind === 'pick' ? 'border-accent text-ink' : 'border-line text-ink-3'
        }`}
      >
        <CalendarRange size={14} />
        <span className="hidden sm:inline">{t('specificMonth')}</span>
        <select
          aria-label={t('specificMonth')}
          value={period.kind === 'pick' ? period.month : ''}
          onChange={(e) => e.target.value && setPeriod({ kind: 'pick', month: e.target.value })}
          className="bg-transparent outline-none"
        >
          <option value="" disabled>
            —
          </option>
          {monthOptions().map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      {/* custom span: from → to (both inclusive) */}
      <label
        className={`flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold ${
          period.kind === 'range' ? 'border-accent text-ink' : 'border-line text-ink-3'
        }`}
      >
        <CalendarRange size={14} />
        <span className="hidden sm:inline">{t('customRange')}</span>
        <input
          type="date"
          aria-label={t('from')}
          value={period.kind === 'range' ? period.from : ''}
          max={today}
          // Picking a start date collapses to that single day (so a one-day
          // pick doesn't silently stretch to today); use the "to" field to
          // extend it into a span.
          onChange={(e) => {
            const v = e.target.value
            if (!v) return
            setPeriod({ kind: 'range', from: v, to: v })
          }}
          className="bg-transparent outline-none"
        />
        <span className="text-ink-3">→</span>
        <input
          type="date"
          aria-label={t('to')}
          value={period.kind === 'range' ? period.to : ''}
          max={today}
          // Tolerate a reversed pick (end before start) by swapping.
          onChange={(e) => {
            const v = e.target.value
            if (!v) return
            const from = period.kind === 'range' ? period.from : v
            setPeriod({ kind: 'range', from: v < from ? v : from, to: v < from ? from : v })
          }}
          className="bg-transparent outline-none"
        />
      </label>
    </div>
  )
}

/** Last 24 months (this month first), for the month-picker dropdown. */
function monthOptions() {
  const now = new Date()
  const fmt = new Intl.DateTimeFormat(
    useI18n.getState().lang === 'fr' ? 'fr-MA' : 'en-GB',
    { month: 'long', year: 'numeric' },
  )
  return Array.from({ length: 24 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = fmt.format(d)
    return { value, label: label.charAt(0).toUpperCase() + label.slice(1) }
  })
}

/* ---------------- dish ranking (food only) ---------------- */
/** "Food" = a real dish. Excludes the whole drinks main and the two
 * "Extras" categories (add-ons, not dishes). Sweets count as food.
 * FOOD_MAINS / EXTRA_CATS_FR / SODA_CAT_FR are shared with the printed
 * sales report (imported at the top) so their counts agree. */
/** gold / silver / bronze for the top-3 podium. */
const MEDALS = ['#D4AF37', '#9CA3AF', '#CD7F32']

interface DishRow {
  name: string
  qty: number
  rev: number
}

/** Aggregate ordered food items across sessions into [{name, qty, rev}].
 * Resolves each item's category via its menu id (falling back to the
 * stored category name for custom/legacy rows) to decide food vs. drink. */
function rankDishes(
  rows: HistorySession[],
  menu: { id: string; category_id: string }[],
  cats: { id: string; name_fr: string; main: string }[],
): DishRow[] {
  const catById = new Map(cats.map((c) => [c.id, c]))
  const menuById = new Map(menu.map((m) => [m.id, m]))
  const catByFr = new Map(cats.map((c) => [c.name_fr, c]))
  const agg = new Map<string, DishRow>()
  for (const r of rows)
    for (const i of r.order_items) {
      if (i.voided) continue
      const mi = i.menu_item_id ? menuById.get(i.menu_item_id) : undefined
      const cat = mi ? catById.get(mi.category_id) : catByFr.get(i.category)
      const main = cat?.main ?? ''
      const catFr = cat?.name_fr ?? i.category
      if (!FOOD_MAINS.includes(main)) continue
      if (EXTRA_CATS_FR.includes(catFr)) continue
      const cur = agg.get(i.name) ?? { name: i.name, qty: 0, rev: 0 }
      cur.qty += i.qty
      cur.rev += i.price * i.qty
      agg.set(i.name, cur)
    }
  return [...agg.values()]
}

/** Total sodas sold (qty + revenue), resolved the same way as rankDishes. */
function countSodas(
  rows: HistorySession[],
  menu: { id: string; category_id: string }[],
  cats: { id: string; name_fr: string; main: string }[],
): { qty: number; rev: number } {
  const catById = new Map(cats.map((c) => [c.id, c]))
  const menuById = new Map(menu.map((m) => [m.id, m]))
  let qty = 0
  let rev = 0
  for (const r of rows)
    for (const i of r.order_items) {
      if (i.voided) continue
      const mi = i.menu_item_id ? menuById.get(i.menu_item_id) : undefined
      const catFr = mi ? catById.get(mi.category_id)?.name_fr : i.category
      if (catFr === SODA_CAT_FR) {
        qty += i.qty
        rev += i.price * i.qty
      }
    }
  return { qty, rev }
}

/* ---------------- analytics ---------------- */
/* One source of truth for what an order IS, used by BOTH the revenue card
 * and the Orders tab so they can never drift apart again. Only a plain
 * "sale" counts toward revenue; VIP is offered, Friends go on a tab
 * (receivable), Staff meals are tracked separately. */
type OrderKind = 'sale' | 'vip' | 'friend' | 'staff'
function orderKind(r: HistorySession): OrderKind {
  if (r.staff_order === true) return 'staff'
  if (r.vip_name || (r.discount ?? 0) === 100) return 'vip'
  if (r.friend_id) return 'friend'
  return 'sale'
}
/** Money actually put in the till for this order (what feeds revenue). */
const collected = (r: HistorySession) => r.payments.reduce((s, p) => s + p.amount, 0)
/** The bill after its remise — a sale is "paid" once collected covers it. */
const netBill = (r: HistorySession) => sessTotal(r) * (1 - (r.discount ?? 0) / 100)
const isPaidSale = (r: HistorySession) =>
  orderKind(r) === 'sale' && netBill(r) > 0 && collected(r) >= netBill(r) - 0.5

function Analytics({ branch }: { branch: BranchScope }) {
  const [period, setPeriod] = useState<Period>({ kind: 'day' })
  const { rows, loading } = useHistory(period, branch)
  const {
    sessions: allSessions,
    tables,
    staff,
    items: liveItems,
    payments: livePayments,
    friendDebts: allDebts,
    friends,
  } = useData()
  const { lang, t } = useI18n()
  // Live/open data comes from the shared store (all branches for an admin),
  // so it needs the same scoping the history query already got.
  const sessions = useMemo(
    () => (branch ? allSessions.filter((s) => s.branch === branch) : allSessions),
    [allSessions, branch],
  )
  const friendDebts = useMemo(
    () => (branch ? allDebts.filter((d) => d.branch === branch) : allDebts),
    [allDebts, branch],
  )

  // Revenue = money actually collected (sum of payments), so the headline
  // number, the cash/card breakdown and the per-day chart always agree:
  // cash + card = revenue, by construction.
  const paidTotal = (r: HistorySession) => r.payments.reduce((s, p) => s + p.amount, 0)
  // Staff meals are kept out of every MAIN revenue figure (headline, cash/
  // card, per-day chart, employee pie) and totalled on their own card below.
  const isStaff = (r: HistorySession) => r.staff_order === true
  const [pFrom, pTo] = periodRange(period)

  // Friend tabs SETTLED in this period. A friend's meal is a receivable when
  // incurred (never revenue); the cash only arrives when they pay the tab
  // back, possibly days later. So it's booked as revenue on the SETTLEMENT
  // day (settled_at) with the method it was actually paid in — a friend who
  // ate on the 24th and pays on the 26th lands in the 26th's takings. The
  // store only holds UNSETTLED tabs, so this is a dedicated query.
  const [friendSettled, setFriendSettled] = useState<FriendDebt[]>([])
  useEffect(() => {
    let alive = true
    const [from, to] = periodRange(period)
    let q = supabase
      .from('friend_debts')
      .select('*')
      .eq('settled', true)
      .not('settled_at', 'is', null)
      .gte('settled_at', from.toISOString())
      .lt('settled_at', to.toISOString())
    if (branch) q = q.eq('branch', branch)
    q.then(({ data }) => {
      if (alive) setFriendSettled((data ?? []) as FriendDebt[])
    })
    return () => {
      alive = false
    }
    // refetch when the period, branch, or live tabs change (a settlement
    // flips a tab from unsettled → settled, which the store's list reflects)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodKey(period), branch, allDebts])
  const friendSettle = useMemo(() => {
    const m = { cash: 0, card: 0, total: 0 }
    for (const d of friendSettled) {
      m[d.method] += d.amount
      m.total += d.amount
    }
    return m
  }, [friendSettled])

  // Is the selected period still running? The floor cards below only mean
  // something while it is — on a finished day or month they'd describe a
  // moment that has nothing to do with the figures beside them.
  const livePeriod = Date.now() >= pFrom.getTime() && Date.now() <= pTo.getTime() + 60_000
  const coversTotal = useMemo(() => rows.reduce((n, r) => n + (r.covers ?? 0), 0), [rows])
  // Revenue from ORDERS closed in the period (this is what "avg ticket" is
  // per, since a friend paying an old tab isn't a new ticket).
  const orderByMethod = useMemo(() => {
    const m = { cash: 0, card: 0 }
    for (const r of rows) {
      if (isStaff(r)) continue
      for (const p of r.payments) m[p.method] += p.amount
    }
    return m
  }, [rows])
  const ordersRevenue = orderByMethod.cash + orderByMethod.card
  // Headline cash/card + revenue ALSO include friend tabs settled today, so
  // "main revenue" reflects money the friend actually handed over.
  const byMethod = {
    cash: orderByMethod.cash + friendSettle.cash,
    card: orderByMethod.card + friendSettle.card,
  }
  const revenue = byMethod.cash + byMethod.card

  // Staff orders: money collected on staff meals, shown apart from revenue.
  const staffRows = useMemo(
    () => rows.filter((r) => isStaff(r)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows],
  )
  const staffTotal = staffRows.reduce((s, r) => s + paidTotal(r), 0)
  // Friends: unsettled debt INCURRED in the selected period (like every
  // other card — "today" shows today's, "month" the month's). A receivable,
  // never revenue. Backlog rows sit on the 1st of their month.
  const friendRows = useMemo(() => {
    const fromS = dayKey(pFrom)
    const toIncl = dayKey(new Date(pTo.getTime() - 1)) // half-open -> last covered day
    return friendDebts.filter((d) => d.incurred_on >= fromS && d.incurred_on <= toIncl)
  }, [friendDebts, pFrom, pTo])
  const friendsOwed = friendRows.reduce((s, d) => s + d.amount, 0)
  const [staffOpen, setStaffOpen] = useState(false)
  const [friendsOpen, setFriendsOpen] = useState(false)

  // Money still on the floor: every OPEN table's unpaid balance (ordered
  // but not settled — cooking, served, or closed-but-unfreed). Deliberately
  // outside `revenue`: it only counts once the cashier collects it.
  const pending = useMemo(() => {
    let amount = 0
    let count = 0
    // Compute this EXACTLY like the floor map does, so the figure can only ever
    // equal the money you actually see on "table de salle":
    //  - walk the real tables and take the ONE session each table shows
    //    (`sessionForTable` = the first open session on it), so hidden
    //    duplicate sessions on the same table — a table that ended up with
    //    several open rows — are counted once, never stacked;
    //  - count a joined session only at its primary table, so a multi-table
    //    join isn't added several times;
    //  - skip a table whose cancellation is pending (ANNULATION — admin
    //    requis): that money is on its way OUT, not coming in, so it must not
    //    sit in "à venir".
    // A VIP (100% remise) nets to 0 on its own; friend/staff tables still owe.
    for (const tb of tables) {
      const s = sessions.find((x) => !x.closed_at && x.table_ids.includes(tb.id))
      if (!s) continue
      if (s.table_ids[0] !== tb.id) continue // count a join once, at its primary
      if (s.cancel_requested) continue // being cancelled — not money coming in
      const gross = liveItems
        .filter((i) => i.session_id === s.id && !i.voided)
        .reduce((sum, i) => sum + i.price * i.qty, 0)
      const due = gross * (1 - (s.discount ?? 0) / 100)
      const paidSoFar = livePayments
        .filter((p) => p.session_id === s.id)
        .reduce((sum, p) => sum + p.amount, 0)
      const left = due - paidSoFar
      if (left > 0.5) {
        amount += left
        count++
      }
    }
    return { amount, count }
  }, [sessions, liveItems, livePayments, tables])

  // VIP (100% remise): comped orders — the money that WOULD have been paid.
  // Shown next to cash/card but never part of the revenue itself.
  const vipRows = useMemo(
    () => rows.filter((r) => (r.discount ?? 0) === 100),
    [rows],
  )
  const vipCost = vipRows.reduce((s, r) => s + sessTotal(r), 0)
  const [vipOpen, setVipOpen] = useState(false)

  const revByDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) {
      if (isStaff(r)) continue
      const [, mo, da] = localDay(r.closed_at!).split('-') // service-day bucket
      const k = `${da}/${mo}`
      m.set(k, (m.get(k) ?? 0) + paidTotal(r))
    }
    // friend tabs settled in the period land on their PAY day, same as they
    // do in the headline revenue.
    for (const d of friendSettled) {
      if (!d.settled_at) continue
      const [, mo, da] = localDay(d.settled_at).split('-')
      const k = `${da}/${mo}`
      m.set(k, (m.get(k) ?? 0) + d.amount)
    }
    return [...m.entries()].reverse().map(([day, total]) => ({ day, total: Math.round(total) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, friendSettled])

  const heat = useMemo(() => {
    // weekday x hour occupancy grid, seeded from seated_at
    const grid = new Map<string, number>()
    let max = 0
    for (const r of rows) {
      const d = new Date(r.seated_at)
      const k = `${d.getDay()}-${d.getHours()}`
      const v = (grid.get(k) ?? 0) + 1
      grid.set(k, v)
      max = Math.max(max, v)
    }
    return { grid, max }
  }, [rows])

  // Revenue is credited to server_id (the waiter who served), NOT waiter_id
  // (which the caisse steals when it takes control to print) — so the till
  // never shows any sales. Falls back to waiter_id on pre-migration rows.
  const waiterStats = useMemo(
    () =>
      staff
        .filter((w) => w.role === 'waiter')
        .map((w) => {
          // staff meals excluded here too — they're not "main" revenue
          const mine = rows.filter(
            (r) => !isStaff(r) && !r.friend_id && (r.server_id ?? r.waiter_id) === w.id,
          )
          const rev = mine.reduce((s, r) => s + sessTotal(r), 0)
          return { ...w, count: mine.length, rev }
        }),
    [rows, staff],
  )

  // Employee donut: waiters with sales this period, biggest earner first.
  const topEmployees = useMemo(
    () => waiterStats.filter((w) => w.rev > 0).sort((a, b) => b.rev - a.rev),
    [waiterStats],
  )

  const days = lang === 'fr'
    ? ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const hours = Array.from({ length: 14 }, (_, i) => i + 10) // 10:00 → 23:00

  return (
    <div className="flex flex-col gap-4">
      <PeriodBar period={period} setPeriod={setPeriod} withAll />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard k={t('revenue')} v={money(revenue)} s={`${rows.length} ${t('ordersCount').toLowerCase()}`} />
        <StatCard k={t('ordersCount')} v={String(rows.length)} s="" />
        {/* The last two cards describe the floor RIGHT NOW — they are not
            period figures and never were. Sitting unlabelled next to a
            period's revenue, they read as if they were: picking "last week"
            still showed today's open tables, so the owner was comparing a
            week of takings against this minute's unpaid balance. They now
            say "en direct", and on a period that is entirely in the PAST —
            where a live number is simply meaningless — they give way to two
            stats that do describe that period. */}
        {livePeriod ? (
          <>
            <StatCard
              k={t('occupied')}
              v={String(sessions.length)}
              s={`/ ${branch ? tables.filter((tb) => tb.branch === branch).length : tables.length} · ${t('liveNow')}`}
            />
            {/* money still on the floor: open tables' unpaid balance. NEVER
                part of revenue — it only counts once actually collected. */}
            <StatCard
              k={t('upcomingPayments')}
              v={money(pending.amount)}
              s={`${pending.count} ${t('upcomingTables')} · ${t('liveNow')}`}
              accent
            />
          </>
        ) : (
          <>
            <StatCard
              k={t('avgTicket')}
              v={money(rows.length ? ordersRevenue / rows.length : 0)}
              s=""
            />
            <StatCard k={t('coversServed')} v={String(coversTotal)} s="" />
          </>
        )}
      </div>

      {/* how the revenue was collected — always sums to the headline */}
      <div className="rounded-2xl border border-line bg-surface p-4 shadow-(--shadow-1)">
        <div className="mb-3 text-xs font-bold tracking-wide text-ink-3 uppercase">
          {t('paymentsBreakdown')}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-surface-2 px-3.5 py-2.5">
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-3">
              <Banknote size={15} /> {t('cash')}
            </span>
            <span className="tnum truncate text-[17px] font-extrabold sm:text-lg">{money(byMethod.cash)}</span>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-surface-2 px-3.5 py-2.5">
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-3">
              <CreditCard size={15} /> {t('card')}
            </span>
            <span className="tnum truncate text-[17px] font-extrabold sm:text-lg">{money(byMethod.card)}</span>
          </div>
          {/* comped VIP orders — informational, never part of the revenue.
              Tap to see each offered order and who it was for. */}
          <button
            onClick={() => vipRows.length > 0 && setVipOpen(true)}
            disabled={vipRows.length === 0}
            className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-stone-900 px-3.5 py-2.5 text-left text-white transition-all enabled:active:scale-[0.99] disabled:opacity-70"
          >
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold">
              <Crown size={15} /> {t('vipCost')}
              {vipRows.length > 0 && (
                <span className="ml-auto text-[11px] font-bold opacity-70">
                  {vipRows.length} · {t('viewDetail')}
                </span>
              )}
            </span>
            <span className="tnum truncate text-[17px] font-extrabold sm:text-lg">{money(vipCost)}</span>
          </button>
          {/* staff meals — collected but kept OUT of the revenue above.
              Tap to see each staff order and what they had. */}
          <button
            onClick={() => staffRows.length > 0 && setStaffOpen(true)}
            disabled={staffRows.length === 0}
            className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-indigo-600 px-3.5 py-2.5 text-left text-white transition-all enabled:active:scale-[0.99] disabled:opacity-70"
          >
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold">
              <Users size={15} /> {t('staffTotal')}
              {staffRows.length > 0 && (
                <span className="ml-auto text-[11px] font-bold opacity-70">
                  {staffRows.length} · {t('viewDetail')}
                </span>
              )}
            </span>
            <span className="tnum truncate text-[17px] font-extrabold sm:text-lg">{money(staffTotal)}</span>
          </button>
          {/* Friends: debt incurred in this period — a receivable, never
              revenue. Tap to see the bills, like VIP/Staff. */}
          <button
            onClick={() => friendRows.length > 0 && setFriendsOpen(true)}
            disabled={friendRows.length === 0}
            className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-left text-white transition-all enabled:active:scale-[0.99] disabled:opacity-70"
          >
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold">
              <Users size={15} /> {t('friends')}
              {friendRows.length > 0 && (
                <span className="ml-auto text-[11px] font-bold opacity-70">
                  {friendRows.length} · {t('viewDetail')}
                </span>
              )}
            </span>
            <span className="tnum truncate text-[17px] font-extrabold sm:text-lg">{money(friendsOwed)}</span>
          </button>
        </div>
      </div>

      {friendsOpen && (
        <FriendDebtsModal debts={friendRows} friends={friends} onClose={() => setFriendsOpen(false)} />
      )}

      {vipOpen && (
        <VipOrdersModal rows={vipRows} tables={tables} onClose={() => setVipOpen(false)} />
      )}
      {staffOpen && (
        <VipOrdersModal
          rows={staffRows}
          tables={tables}
          onClose={() => setStaffOpen(false)}
          title={t('staffTotal')}
          icon={<Users size={18} />}
          amount={paidTotal}
        />
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-ink-3">{t('loading')}</p>
      ) : (
        <>
          {revByDay.length > 1 && (
            <Block title={t('revenueOverTime')}>
              <div className="h-56">
                <ResponsiveContainer>
                  <BarChart data={revByDay} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--color-ink-3)' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--color-ink-3)' }} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(v) => [money(Number(v)), t('revenue')]}
                      contentStyle={{ borderRadius: 12, border: '1px solid var(--color-line)', fontSize: 12 }}
                    />
                    {/* no re-animation: a background data refresh must not
                        replay the grow-in and look like a flicker */}
                    <Bar
                      dataKey="total"
                      fill="var(--color-accent)"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={38}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Block>
          )}

          <Block title={t('revenueByEmployee')}>
            {topEmployees.length === 0 ? (
              <RankList rows={[]} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 sm:items-center">
                <div className="h-56">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={topEmployees.map((w) => ({ name: w.name, rev: Math.round(w.rev) }))}
                        dataKey="rev"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={95}
                        paddingAngle={2}
                        isAnimationActive={false}
                      >
                        {/* podium colours: 1st gold, 2nd silver, 3rd bronze,
                            each remaining waiter in their own colour */}
                        {topEmployees.map((w, i) => (
                          <Cell key={w.id} fill={i < 3 ? MEDALS[i] : w.color} stroke="var(--color-surface)" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v, n) => [money(Number(v)), n]}
                        contentStyle={{ borderRadius: 12, border: '1px solid var(--color-line)', fontSize: 12 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <RankList
                  rows={topEmployees.map((w) => [w.name, `${money(w.rev)} · ${w.count}`])}
                  medals
                />
              </div>
            )}
          </Block>

          <Block title={t('busiest')}>
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-0.5">
                <thead>
                  <tr>
                    <th />
                    {hours.map((h) => (
                      <th key={h} className="pb-1 text-[10px] font-semibold text-ink-3">
                        {h}h
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                    <tr key={d}>
                      <td className="pr-2 text-[11px] font-semibold text-ink-3">{days[d]}</td>
                      {hours.map((h) => {
                        const v = heat.grid.get(`${d}-${h}`) ?? 0
                        const a = heat.max ? v / heat.max : 0
                        return (
                          <td key={h}>
                            <div
                              title={`${days[d]} ${h}h — ${v}`}
                              className="size-6 rounded-[5px] sm:size-7"
                              style={{
                                background: a === 0 ? 'var(--color-surface-2)' : `color-mix(in srgb, var(--color-accent) ${15 + a * 85}%, white)`,
                              }}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Block>

        </>
      )}
    </div>
  )
}

/* ---------------- dish insights (food ranking) ---------------- */
function DishInsights({ branch }: { branch: BranchScope }) {
  const [period, setPeriod] = useState<Period>({ kind: 'day' })
  const [sort, setSort] = useState<'qty' | 'rev'>('qty')
  const { rows, loading } = useHistory(period, branch)
  const { menu, categories } = useData()
  const t = useI18n((s) => s.t)

  const dishes = useMemo(
    () =>
      rankDishes(rows, menu, categories).sort((a, b) =>
        sort === 'qty' ? b.qty - a.qty || b.rev - a.rev : b.rev - a.rev || b.qty - a.qty,
      ),
    [rows, menu, categories, sort],
  )
  const totalQty = dishes.reduce((s, d) => s + d.qty, 0)
  // Sodas live outside the ranking (they'd always top it) — counted alone.
  const sodas = useMemo(() => countSodas(rows, menu, categories), [rows, menu, categories])
  const podium = dishes.slice(0, 3)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PeriodBar period={period} setPeriod={setPeriod} withAll />

      <div className="grid grid-cols-2 gap-3">
        <StatCard k={t('dishesSold')} v={String(totalQty)} s={`${dishes.length} ${t('items')}`} />
        <StatCard k={t('sodasSold')} v={String(sodas.qty)} s={money(sodas.rev)} />
      </div>

      {/* sort toggle */}
      <div className="flex w-full rounded-full bg-surface-2 p-1">
        {(['qty', 'rev'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSort(s)}
            className={`min-h-9 flex-1 rounded-full text-[13px] font-semibold transition-all ${
              sort === s ? 'bg-surface shadow-(--shadow-1)' : 'text-ink-3'
            }`}
          >
            {s === 'qty' ? t('byQty') : t('byRevenue')}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-ink-3">{t('loading')}</p>
      ) : dishes.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-3">{t('noOrders')}</p>
      ) : (
        <>
          {/* podium — top 3 for the current sort, gold / silver / bronze */}
          <div className="grid grid-cols-3 gap-2.5">
            {podium.map((d, i) => (
              <div
                key={d.name}
                className="flex flex-col items-center gap-1 rounded-2xl border-2 bg-surface px-2 py-3 text-center shadow-(--shadow-1)"
                style={{ borderColor: MEDALS[i] }}
              >
                <span className="text-2xl leading-none">{['🥇', '🥈', '🥉'][i]}</span>
                <span className="line-clamp-2 text-[12.5px] font-bold">{d.name}</span>
                <span className="tnum text-[12px] font-extrabold" style={{ color: MEDALS[i] }}>
                  {sort === 'qty' ? `×${d.qty}` : money(d.rev)}
                </span>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-(--shadow-1)">
            {dishes.map((d, i) => (
              <div
                key={d.name}
                className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0"
              >
                <span
                  className="tnum grid size-6 shrink-0 place-items-center rounded-md text-[12px] font-extrabold"
                  style={
                    i < 3
                      ? { background: MEDALS[i], color: '#fff' }
                      : { color: 'var(--color-ink-3)' }
                  }
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{d.name}</span>
                <span className="tnum shrink-0 rounded-full bg-accent/10 px-2.5 py-1 text-[12.5px] font-bold text-accent">
                  ×{d.qty}
                </span>
                <span className="tnum w-24 shrink-0 text-right text-[14px] font-extrabold">
                  {money(d.rev)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** Every comped (VIP) order in the period, one card each: who it was for,
 * which table, when, the items and what it would have cost. */
function VipOrdersModal({
  rows,
  tables,
  onClose,
  title,
  icon,
  amount = sessTotal,
}: {
  rows: HistorySession[]
  tables: RestaurantTable[]
  onClose: () => void
  /** Header title + icon and the per-order amount — defaults to VIP (comped
   * face value); Staff passes its own so the modal doubles for both. */
  title?: string
  icon?: React.ReactNode
  amount?: (r: HistorySession) => number
}) {
  const { lang, t } = useI18n()
  const total = rows.reduce((s, r) => s + amount(r), 0)
  const ordered = [...rows].sort(
    (a, b) => new Date(b.closed_at!).getTime() - new Date(a.closed_at!).getTime(),
  )

  return (
    <Modal onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-lg font-bold">
            {icon ?? <Crown size={18} />} {title ?? t('vipCost')}
          </h2>
          <p className="mt-1 text-[13px] text-ink-3">
            {rows.length} {t('ordersCount').toLowerCase()} · {money(total)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex max-h-[60vh] flex-col gap-2.5 overflow-y-auto">
        {ordered.map((r) => {
          const items = r.order_items.filter((i) => !i.voided)
          return (
            <div key={r.id} className="rounded-2xl border border-line bg-surface-2 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-[14.5px] font-bold">
                    {r.vip_name?.trim() || t('vipNone')}
                  </span>
                  <span className="block text-[12px] text-ink-3">
                    {labelsFor(tables, r.table_ids)} · {dateLabel(r.closed_at!, lang)}
                  </span>
                </span>
                <span className="tnum shrink-0 text-[15px] font-extrabold">
                  {money(amount(r))}
                </span>
              </div>
              <div className="mt-2 border-t border-line pt-2">
                {items.map((i) => (
                  <div key={i.id} className="flex justify-between gap-3 py-0.5 text-[13px]">
                    <span className="min-w-0 truncate">
                      {i.qty}× {i.name}
                    </span>
                    <span className="tnum shrink-0 text-ink-2">{money(i.price * i.qty)}</span>
                  </div>
                ))}
                {items.length === 0 && (
                  <p className="py-1 text-[13px] text-ink-3">{t('noItems')}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <Btn className="mt-4 w-full" onClick={onClose}>
        {t('close')}
      </Btn>
    </Modal>
  )
}

function StatCard({
  k,
  v,
  s,
  accent,
}: {
  k: string
  v: string
  s: string
  /** Highlighted card (e.g. money not yet collected). */
  accent?: boolean
}) {
  return (
    <div
      className={`min-w-0 rounded-2xl border p-3.5 shadow-(--shadow-1) sm:p-4 ${
        accent ? 'border-amber-300 bg-amber-50' : 'border-line bg-surface'
      }`}
    >
      <div className={`truncate text-xs font-semibold ${accent ? 'text-amber-700' : 'text-ink-3'}`}>{k}</div>
      {/* value can be long ("48 943,00 DH") — shrink on phones and never
          overflow the card */}
      <div
        className={`tnum mt-1 truncate text-[17px] font-extrabold tracking-tight sm:text-[24px] ${
          accent ? 'text-amber-900' : ''
        }`}
      >
        {v}
      </div>
      {s && (
        <div className={`mt-0.5 truncate text-xs ${accent ? 'text-amber-700/80' : 'text-ink-3'}`}>{s}</div>
      )}
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-(--shadow-1)">
      <h3 className="mb-3 text-[15px] font-bold">{title}</h3>
      {children}
    </section>
  )
}

function RankList({ rows, dots, medals }: { rows: [string, string][]; dots?: string[]; medals?: boolean }) {
  const t = useI18n((s) => s.t)
  if (!rows.length) return <p className="py-4 text-center text-sm text-ink-3">{t('noOrders')}</p>
  return (
    <div>
      {rows.map(([name, val], i) => (
        <div key={name} className="flex items-center justify-between border-b border-line py-2 text-sm last:border-none">
          <span className="inline-flex items-center gap-2.5">
            {dots ? (
              <span className="size-3 shrink-0 rounded-full" style={{ background: dots[i] }} />
            ) : (
              // medals: top 3 get gold/silver/bronze rank badges
              <span
                className="grid size-5.5 shrink-0 place-items-center rounded-md text-[11px] font-extrabold"
                style={
                  medals && i < 3
                    ? { background: MEDALS[i], color: '#fff' }
                    : { background: 'var(--color-surface-2)', color: 'var(--color-ink-2)' }
                }
              >
                {i + 1}
              </span>
            )}
            <span className="font-medium">{name}</span>
          </span>
          <span className="tnum font-semibold">{val}</span>
        </div>
      ))}
    </div>
  )
}

/* ---------------- orders list ---------------- */
/** Little tag telling a closed order apart: paid sale, VIP, friend tab,
 * staff meal, or a sale that closed without covering its bill. */
function OrderTag({ r }: { r: HistorySession }) {
  const t = useI18n((s) => s.t)
  const k = orderKind(r)
  const cls =
    k === 'vip'
      ? 'bg-stone-900 text-white'
      : k === 'friend'
        ? 'bg-emerald-100 text-emerald-700'
        : k === 'staff'
          ? 'bg-indigo-100 text-indigo-700'
          : isPaidSale(r)
            ? 'bg-st-served-soft text-st-served'
            : 'bg-red-100 text-danger'
  const label =
    k === 'vip'
      ? 'VIP'
      : k === 'friend'
        ? t('friends')
        : k === 'staff'
          ? t('staffTab')
          : isPaidSale(r)
            ? t('paid')
            : t('ordUnpaid')
  return (
    <span className={`rounded-full px-2 py-px text-[10px] font-bold tracking-wide uppercase ${cls}`}>
      {label}
    </span>
  )
}

function OrdersList({ branch }: { branch: BranchScope }) {
  const [period, setPeriod] = useState<Period>({ kind: 'day' })
  const { rows, loading } = useHistory(period, branch)
  const { staff, tables, sessions: allSessions, items, payments } = useData()
  const sessions = useMemo(
    () => (branch ? allSessions.filter((s) => s.branch === branch) : allSessions),
    [allSessions, branch],
  )
  const now = useNow()
  const { lang, t } = useI18n()
  const [openId, setOpenId] = useState<string | null>(null)
  // TEMP-DELETE-ORDER: guards double-taps while a deletion is in flight
  const [deleting, setDeleting] = useState<string | null>(null)

  // Live (still-open) sessions — just seated, cooking, served, unpaid —
  // shown on top whenever the selected period includes right now, so the
  // admin sees every order, not only settled history.
  const [from, to] = periodRange(period)
  const includesNow = now >= from.getTime() && now <= to.getTime() + 60_000
  const liveRows: HistorySession[] = includesNow
    ? sessions
        .filter((s) => !s.closed_at)
        .sort((a, b) => new Date(b.seated_at).getTime() - new Date(a.seated_at).getTime())
        .map((s) => ({
          ...s,
          order_items: items.filter((i) => i.session_id === s.id),
          payments: payments.filter((p) => p.session_id === s.id),
        }))
    : []
  const all = [...liveRows, ...rows]

  // Reconciliation, computed from the SAME rows the list shows and by the
  // SAME rule as the analytics revenue card — so "sum of paid sales ==
  // revenue" holds by construction.
  const bucket = { sale: 0, vip: 0, friend: 0, staff: 0, unpaid: 0 }
  for (const r of all) {
    const k = orderKind(r)
    if (k === 'sale') {
      if (!r.closed_at || collected(r) < netBill(r) - 0.5) bucket.unpaid += netBill(r) - collected(r)
      bucket.sale += collected(r)
    } else if (k === 'vip') bucket.vip += netBill(r)
    else if (k === 'friend') bucket.friend += sessTotal(r)
    else bucket.staff += collected(r)
  }
  const revenue = bucket.sale

  return (
    <div className="flex flex-col gap-4">
      <PeriodBar period={period} setPeriod={setPeriod} />

      {!loading && all.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-(--shadow-1)">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs font-bold tracking-wide text-ink-3 uppercase">
              {t('ordRevenue')}
            </span>
            <span className="tnum text-[22px] font-extrabold">{money(revenue)}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px] sm:grid-cols-4">
            {([
              ['vip', t('vipCost'), bucket.vip],
              ['friend', t('friends'), bucket.friend],
              ['staff', t('staffTab'), bucket.staff],
              ['unpaid', t('ordUnpaid'), bucket.unpaid],
            ] as const).map(([k, label, v]) =>
              v > 0.5 ? (
                <div key={k} className="flex items-center justify-between gap-2">
                  <span className="truncate text-ink-3">{label}</span>
                  <span className="tnum font-bold text-ink-2">{money(v)}</span>
                </div>
              ) : null,
            )}
          </div>
          <p className="mt-2 text-[11.5px] text-ink-3">{t('ordReconHint')}</p>
        </div>
      )}

      {loading && <p className="py-10 text-center text-sm text-ink-3">{t('loading')}</p>}
      {!loading && all.length === 0 && (
        <p className="py-10 text-center text-sm text-ink-3">{t('noOrders')}</p>
      )}
      <div className="flex flex-col gap-2">
        {all.map((r) => {
          const w = staff.find((s) => s.id === r.waiter_id)
          // Show what was actually charged: face value minus the session's
          // remise (staff -40%, VIP -100%, friend/plain remises). Showing
          // the gross made a 51 MAD staff order read as 85.
          const gross = sessTotal(r)
          const disc = r.discount ?? 0
          const total = gross * (1 - disc / 100)
          const open = openId === r.id
          return (
            <div key={r.id} className="rounded-2xl border border-line bg-surface shadow-(--shadow-1)">
              <button
                onClick={() => setOpenId(open ? null : r.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <ClipboardList size={17} className="shrink-0 text-ink-3" />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 text-[14px] font-bold">
                      {labelsFor(tables, r.table_ids)} · {money(total)}
                      {!r.closed_at ? (
                        <StatusChip status={visualStatus(r, now)} />
                      ) : (
                        <OrderTag r={r} />
                      )}
                    </span>
                    <span className="block truncate text-xs text-ink-3">
                      {dateLabel((r.closed_at ?? r.seated_at)!, lang)} · {w?.name ?? '—'} · {r.covers} {t('covers')}
                    </span>
                  </span>
                </span>
                <span className="tnum shrink-0 text-xs font-semibold text-ink-3">
                  {r.order_items.filter((i) => !i.voided).length} {t('items')}
                </span>
              </button>
              {open && (
                <div className="anim-fade border-t border-line px-4 py-3">
                  {r.order_items.map((i) => (
                    <div
                      key={i.id}
                      className={`flex justify-between py-1 text-[13px] ${i.voided ? 'text-ink-3 line-through' : ''}`}
                    >
                      <span>
                        {i.qty}× {i.name}
                        {i.voided && ` (${t('voidFlag')})`}
                      </span>
                      <span className="tnum">{money(i.price * i.qty)}</span>
                    </div>
                  ))}
                  {disc > 0 && (
                    <>
                      <div className="mt-2 flex justify-between border-t border-dashed border-line pt-2 text-[12px] text-ink-3">
                        <span>{t('total')}</span>
                        <span className="tnum">{money(gross)}</span>
                      </div>
                      <div className="flex justify-between text-[12px] font-semibold text-ink-2">
                        <span>{disc === 100 ? 'VIP' : `${t('discount')} -${disc}%`}</span>
                        <span className="tnum">-{money(gross - total)}</span>
                      </div>
                    </>
                  )}
                  <div className={`flex justify-between text-[13px] font-bold ${disc > 0 ? 'mt-1' : 'mt-2 border-t border-dashed border-line pt-2'}`}>
                    <span>{disc > 0 ? t('totalNet') : t('total')}</span>
                    <span className="tnum">{money(total)}</span>
                  </div>
                  {r.payments.map((p) => (
                    <div key={p.id} className="mt-1 flex justify-between text-xs text-ink-3">
                      <span>
                        {t(payKindKey[p.kind])} · {p.method === 'cash' ? t('cash') : t('card')}
                      </span>
                      <span className="tnum">{money(p.amount)}</span>
                    </div>
                  ))}
                  <Btn
                    className="mt-3 w-full"
                    onClick={() =>
                      void printBill(
                        labelsFor(tables, r.table_ids),
                        r.order_items.filter((i) => !i.voided && i.ticket_no != null),
                        { payments: r.payments },
                      ).catch((e) => console.error('[bill-print] failed:', e))
                    }
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Printer size={15} /> {t('viewBill')}
                    </span>
                  </Btn>
                  {/* TEMP-DELETE-ORDER: one-off cleanup of test orders */}
                  <Btn
                    variant="danger"
                    className="mt-2 w-full"
                    disabled={deleting === r.id}
                    onClick={async () => {
                      const label = labelsFor(tables, r.table_ids)
                      if (
                        !window.confirm(
                          `Supprimer définitivement la commande ${label} (${money(total)}) ?\n\nSon revenu disparaît de toutes les statistiques (jour/semaine/mois) et son activité du journal. Irréversible.`,
                        )
                      )
                        return
                      setDeleting(r.id)
                      try {
                        await deleteOrderCompletely(r, tables)
                      } finally {
                        setDeleting(null)
                      }
                    }}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Trash2 size={15} /> Supprimer (commande test)
                    </span>
                  </Btn>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ============ TEMP-DELETE-ORDER ============
 * One-off cleanup while test orders pollute the owner's numbers. Remove
 * this whole block (and the button above, search "TEMP-DELETE-ORDER")
 * once the cleanup is done.
 *
 * Deletes exactly one session and everything that belongs to it:
 *  - its payments (revenue leaves every day/week/month/forever stat,
 *    since revenue is summed from payments)
 *  - its order_items
 *  - its journal entries — the log carries no session id, so rows are
 *    matched by the session's table LABELS within the session's own
 *    lifetime window (a table hosts one session at a time, so the window
 *    is exclusive to it); labels are compared whole ("T1" never matches
 *    "T12"), keeping the deletion scoped to this order only.
 */
async function deleteOrderCompletely(
  r: HistorySession,
  tables: { id: string; label: string }[],
) {
  const labels = r.table_ids.map((id) => tables.find((tb) => tb.id === id)?.label ?? id)
  const from = new Date(new Date(r.seated_at).getTime() - 60_000).toISOString()
  const to = new Date(
    (r.closed_at ? new Date(r.closed_at).getTime() : Date.now()) + 60_000,
  ).toISOString()
  // Scoped to the location's tables inside the time window.
  const { data: logs } = await supabase
    .from('activity_log')
    .select('id, table_ref')
    .eq('branch', r.branch)
    .gte('at', from)
    .lte('at', to)
  const touches = (ref: string) => ref.split('+').some((l) => labels.includes(l))
  const logIds = ((logs ?? []) as { id: string; table_ref: string }[])
    .filter((l) => l.table_ref && touches(l.table_ref))
    .map((l) => l.id)
  if (logIds.length) await supabase.from('activity_log').delete().in('id', logIds)
  await supabase.from('payments').delete().eq('session_id', r.id)
  // A friend's bill lives on as a DEBT. Without this the order vanished
  // from Commandes but the friend still owed the money, with the debt's
  // session_id nulled out (the FK is ON DELETE SET NULL) so it couldn't
  // even be traced back.
  await supabase.from('friend_debts').delete().eq('session_id', r.id)
  await supabase.from('order_items').delete().eq('session_id', r.id)
  await supabase.from('table_sessions').delete().eq('id', r.id)
  await useData.getState().refresh()
}
/* ============ /TEMP-DELETE-ORDER ============ */

/* ---------------- staff manager ---------------- */
const COLORS = ['#F59E0B', '#EC4899', '#10B981', '#6366F1', '#EF4444', '#0EA5E9', '#8B5CF6', '#84CC16']
const NEUTRAL_COLOR = '#78716C' // cashier/admin — never shown

// Auto-pick a colour not already used by another active waiter (colours must
// all differ). If every palette colour is taken, fall back to the least-used.
function pickWaiterColor(staff: Staff[], excludeId?: string): string {
  const used = new Set(
    staff.filter((s) => s.role === 'waiter' && s.active && s.id !== excludeId).map((s) => s.color),
  )
  const free = COLORS.find((c) => !used.has(c))
  if (free) return free
  const counts = new Map<string, number>()
  for (const s of staff) if (s.role === 'waiter') counts.set(s.color, (counts.get(s.color) ?? 0) + 1)
  return COLORS.slice().sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0))[0]
}

function StaffManager({ branch }: { branch: BranchScope }) {
  const { staff, refresh } = useData()
  const t = useI18n((s) => s.t)
  const [editing, setEditing] = useState<Staff | 'new' | null>(null)
  const [err, setErr] = useState('')

  // Every user's PIN, shown directly in the list. Gated server-side on the
  // admin's own password (staff_secrets RPC re-proves it).
  const admin = useAuth((s) => s.user)!
  const adminSecret = useAuth((s) => s.secret)
  const [pins, setPins] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    if (!adminSecret) return
    let alive = true
    supabase
      .rpc('staff_secrets', { p_admin_id: admin.id, p_admin_secret: adminSecret })
      .then(({ data }) => {
        if (!alive) return
        setPins(new Map(((data as { id: string; secret: string }[]) ?? []).map((r) => [r.id, r.secret])))
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff.length, editing])

  // The staff table has no anon RLS policies (PIN hashes live there), so
  // direct .update() calls silently match 0 rows — everything must go
  // through the security-definer RPCs.
  const toggleActive = async (s: Staff) => {
    setErr('')
    const { error } = await supabase.rpc('staff_set_active', {
      p_staff_id: s.id,
      p_active: !s.active,
    })
    if (error) return setErr(error.message)
    await refresh()
  }

  const remove = async (s: Staff) => {
    if (!window.confirm(`${t('deleteStaffConfirm')} (${s.name})`)) return
    setErr('')
    const { error } = await supabase.rpc('staff_delete', { p_staff_id: s.id })
    if (error) {
      // FK violation -> the employee is referenced by sessions/payments/log
      setErr(error.code === '23503' ? t('deleteStaffHasHistory') : error.message)
      return
    }
    await refresh()
  }

  // Single-location: every staff member belongs to the one location.
  const shown = staff.filter((s) => !branch || s.role === 'admin' || s.branch === branch)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <Btn variant="primary" onClick={() => setEditing('new')}>
        <span className="inline-flex items-center gap-1.5">
          <Plus size={16} /> {t('addStaff')}
        </span>
      </Btn>
      {err && <p className="text-[13px] font-semibold text-danger">{err}</p>}
      {shown
        .slice()
        .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name))
        .map((s) => (
          <div
            key={s.id}
            className={`flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-(--shadow-1) ${
              s.active ? '' : 'opacity-50'
            }`}
          >
            <span className="flex min-w-0 items-center gap-3">
              {s.role === 'waiter' ? (
                <span className="size-3 shrink-0 rounded-full" style={{ background: s.color }} />
              ) : (
                <span className="size-3 shrink-0 rounded-full border border-line-2" />
              )}
              <span className="min-w-0">
                <span className="block truncate text-[14.5px] font-bold">{s.name}</span>
                <span className="block text-xs text-ink-3">
                  @{s.username} · {t(`role_${s.role}`)}
                  {s.role !== 'admin' && (
                    <span className="tnum font-bold text-ink-2"> · PIN {pins.get(s.id) ?? '—'}</span>
                  )}
                </span>
              </span>
            </span>
            <span className="flex shrink-0 gap-1.5">
              <button
                onClick={() => setEditing(s)}
                aria-label={t('editStaff')}
                className="grid size-10 place-items-center rounded-full bg-surface-2 text-ink-2 hover:bg-line"
              >
                <Pencil size={15} />
              </button>
              <button
                onClick={() => toggleActive(s)}
                className={`min-h-10 rounded-full px-3.5 text-xs font-bold ${
                  s.active ? 'bg-surface-2 text-danger' : 'bg-st-served-soft text-st-served'
                }`}
              >
                {s.active ? t('deactivate') : t('activate')}
              </button>
              <button
                onClick={() => remove(s)}
                aria-label={t('deleteStaff')}
                className="grid size-10 place-items-center rounded-full bg-surface-2 text-danger hover:bg-line"
              >
                <Trash2 size={15} />
              </button>
            </span>
          </div>
        ))}
      {editing && <StaffModal staff={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function StaffModal({ staff: existing, onClose }: { staff: Staff | null; onClose: () => void }) {
  const t = useI18n((s) => s.t)
  const { staff, refresh } = useData()
  const [name, setName] = useState(existing?.name ?? '')
  const [username, setUsername] = useState(existing?.username ?? '')
  const [role, setRole] = useState<Role>(existing?.role ?? 'waiter')
  // Single-location: every account belongs to the one 'main' location.
  const branch: Branch = 'main'
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // Current PIN of the person being edited. Fetched through staff_secrets,
  // which re-proves this admin's own password server-side; null while
  // loading or when the PIN predates the plaintext column (unknown).
  const admin = useAuth((s) => s.user)!
  const adminSecret = useAuth((s) => s.secret)
  const [currentSecret, setCurrentSecret] = useState<string | null>(null)
  const [secretsLoaded, setSecretsLoaded] = useState(false)
  useEffect(() => {
    if (!existing || !adminSecret) return
    let alive = true
    supabase
      .rpc('staff_secrets', { p_admin_id: admin.id, p_admin_secret: adminSecret })
      .then(({ data }) => {
        if (!alive) return
        const row = (data as { id: string; secret: string }[] | null)?.find(
          (r) => r.id === existing.id,
        )
        setCurrentSecret(row?.secret ?? null)
        setSecretsLoaded(true)
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id])

  // Waiters AND cashiers log in with a 4-digit PIN on the pad; only the
  // admin account still uses a username + password.
  const secretOk = role === 'admin' ? secret.length >= 4 : /^\d{4}$/.test(secret)
  const valid = name.trim() && username.trim() && (existing ? secret === '' || secretOk : secretOk)

  // Colour is assigned automatically — waiters get a distinct palette colour,
  // cashier/admin get a neutral (never displayed).
  const colorFor = (r: Role): string => {
    if (r !== 'waiter') return NEUTRAL_COLOR
    if (existing?.role === 'waiter' && existing.color) return existing.color // keep on edit
    return pickWaiterColor(staff, existing?.id)
  }

  const save = async () => {
    setBusy(true)
    setErr('')
    try {
      const color = colorFor(role)
      if (existing) {
        // must go through the security-definer RPC — see StaffManager
        const { error } = await supabase.rpc('staff_update', {
          p_staff_id: existing.id,
          p_name: name.trim(),
          p_username: username.trim().toLowerCase(),
          p_role: role,
          p_color: color,
        })
        if (error) throw error
        if (role !== 'admin' && branch !== existing.branch) {
          const { error: eb } = await supabase.rpc('staff_set_branch', {
            p_staff_id: existing.id,
            p_branch: branch,
          })
          if (eb) throw eb
        }
        if (secret) {
          const { error: e2 } = await supabase.rpc('staff_set_secret', {
            p_staff_id: existing.id,
            p_secret: secret,
          })
          if (e2) throw e2
        }
      } else {
        const { error } = await supabase.rpc('staff_create', {
          p_name: name.trim(),
          p_username: username.trim().toLowerCase(),
          p_role: role,
          p_secret: secret,
          p_color: color,
          p_branch: branch,
        })
        if (error) throw error
      }
      await refresh()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const field =
    'min-h-11 w-full rounded-xl border border-line-2 bg-surface-2 px-3.5 text-[14px] outline-none focus:border-accent'

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-bold">{existing ? t('editStaff') : t('addStaff')}</h2>
      <div className="mt-4 flex flex-col gap-3">
        <label>
          <span className="mb-1 block text-xs font-bold text-ink-2">{t('fullName')}</span>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-bold text-ink-2">{t('username')}</span>
          <input className={field} value={username} autoCapitalize="none" onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-bold text-ink-2">{t('roleLabel')}</span>
          <select className={field} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="waiter">{t('role_waiter')}</option>
            <option value="cashier">{t('role_cashier')}</option>
            <option value="admin">{t('role_admin')}</option>
          </select>
        </label>
        {existing && secretsLoaded && (
          <div className="flex items-center justify-between rounded-xl bg-surface-2 px-3.5 py-2.5">
            <span className="text-xs font-bold text-ink-2">
              {existing.role === 'admin' ? t('currentPassword') : t('currentPin')}
            </span>
            {currentSecret ? (
              <span className="tnum text-[15px] font-extrabold tracking-[0.2em]">{currentSecret}</span>
            ) : (
              <span className="text-xs font-medium text-ink-3">{t('secretUnknown')}</span>
            )}
          </div>
        )}
        <label>
          <span className="mb-1 block text-xs font-bold text-ink-2">
            {role === 'admin' ? t('passwordLabel') : t('pinLabel')}
            {existing && <span className="ml-1 font-normal text-ink-3">({t('newSecretHint')})</span>}
          </span>
          <input
            className={field}
            value={secret}
            inputMode={role === 'admin' ? 'text' : 'numeric'}
            maxLength={role === 'admin' ? 32 : 4}
            onChange={(e) => setSecret(e.target.value)}
          />
        </label>
        {err && <p className="text-[13px] font-semibold text-danger">{err}</p>}
        <div className="mt-1 flex gap-2.5">
          <Btn className="flex-1" onClick={onClose}>
            {t('cancel')}
          </Btn>
          <Btn variant="primary" className="flex-1" disabled={!valid || busy} onClick={save}>
            {t('save')}
          </Btn>
        </div>
      </div>
    </Modal>
  )
}

/* ---------------- journal ---------------- */
const ACT_KEY: Record<string, TKey> = {
  seat: 'act_seat',
  join: 'act_join',
  send_kitchen: 'act_send_kitchen',
  served: 'act_served',
  pay: 'act_pay',
  close_table: 'act_close_table',
  void_item: 'act_void_item',
  cancel_table: 'act_cancel_table',
  take_over: 'act_take_over',
  print_bill: 'act_print_bill',
  stock: 'act_stock',
  price: 'act_price',
  report_request: 'act_report_request',
  report_approve: 'act_report_approve',
  report_deny: 'act_report_deny',
  report_print: 'act_report_print',
  friend_set: 'act_friend_set',
  friend_debt: 'act_friend_debt',
  friend_add: 'act_friend_add',
  friend_rename: 'act_friend_rename',
  friend_remove: 'act_friend_remove',
  lock_table: 'act_lock_table',
  reopen_table: 'act_reopen_table',
  transfer: 'act_transfer',
  remove_items: 'act_remove_items',
  auto_free: 'act_auto_free',
  auto_dupe: 'act_auto_dupe',
}


function Journal({ branch }: { branch: BranchScope }) {
  const { staff } = useData()
  const { lang, t } = useI18n()
  const [rows, setRows] = useState<ActivityLog[]>([])
  const [tab, setTab] = useState<'all' | 'waiters' | 'caisse'>('all')
  const [date, setDate] = useState(todayKey()) // default: today's service day
  const tick = useData((s) => s.sessions)

  useEffect(() => {
    // Scope to the chosen service day (05:00→05:00) so a busy day's MORNING
    // isn't cut off — a flat newest-first limit only reached back a few hours.
    // Clearing the date ('') falls back to the most recent activity across days.
    let q = supabase.from('activity_log').select('*').order('at', { ascending: false })
    if (branch) q = q.eq('branch', branch)
    if (date) {
      const { from, to } = dayPeriod(date)
      q = q.gte('at', from.toISOString()).lt('at', to.toISOString()).limit(3000)
    } else {
      q = q.limit(400)
    }
    q.then(({ data }) => setRows((data ?? []) as ActivityLog[]))
  }, [tick, date, branch])

  const roleOf = (id: string | null) => staff.find((s) => s.id === id)?.role
  const filtered = rows.filter((l) => {
    if (tab === 'waiters' && roleOf(l.staff_id) !== 'waiter') return false
    if (tab === 'caisse' && roleOf(l.staff_id) !== 'cashier') return false
    if (date && localDay(l.at) !== date) return false
    return true
  })

  const tabs: { id: typeof tab; label: string }[] = [
    { id: 'all', label: t('filterAll') },
    { id: 'waiters', label: t('filterWaiters') },
    { id: 'caisse', label: t('filterCaisse') },
  ]

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-full bg-surface-2 p-1">
          {tabs.map((x) => (
            <button
              key={x.id}
              onClick={() => setTab(x.id)}
              className={`min-h-9 rounded-full px-4 text-[13px] font-semibold transition-all ${
                tab === x.id ? 'bg-surface shadow-(--shadow-1)' : 'text-ink-3'
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>
        <label
          className={`flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold ${
            date ? 'border-accent text-ink' : 'border-line text-ink-3'
          }`}
        >
          <CalendarDays size={14} />
          <input
            type="date"
            aria-label={t('specificDay')}
            value={date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.target.value)}
            className="bg-transparent outline-none"
          />
          {date && (
            <button onClick={() => setDate('')} className="text-ink-3" aria-label={t('allDates')}>
              ✕
            </button>
          )}
        </label>
      </div>

      {filtered.length === 0 && <p className="py-10 text-center text-sm text-ink-3">{t('noOrders')}</p>}
      {filtered.map((l) => (
        <JournalRow key={l.id} log={l} staff={staff} lang={lang} t={t} />
      ))}
    </div>
  )
}

function JournalRow({
  log: l,
  staff,
  lang,
  t,
}: {
  log: ActivityLog
  staff: Staff[]
  lang: string
  t: (k: TKey) => string
}) {
  const [showBill, setShowBill] = useState(false)
  const who = staff.find((s) => s.id === l.staff_id)
  const d = l.detail as {
    method?: 'cash' | 'card'
    amount?: number
    kind?: Payment['kind']
    parts?: number
    itemNames?: string[]
    remainingAfter?: number
    reason?: string
    total?: number
    items?: { name: string; qty: number; price: number }[]
    to?: string
  }
  const actLabel = ACT_KEY[l.action] ? t(ACT_KEY[l.action]) : l.action.replace(/_/g, ' ')

  // A compact detail line for the many actions that used to render nothing —
  // pulled straight from the logged `detail` JSON so every row says something.
  const r = (l.detail ?? {}) as Record<string, unknown>
  const nameOf = (id: unknown) => staff.find((s) => s.id === id)?.name ?? '—'
  const money0 = (v: unknown) => money(Number(v) || 0)
  const summary = ((): string => {
    switch (l.action) {
      case 'seat':
        return `${r.covers} ${t('covers')}`
      case 'send_kitchen':
        // newer rows carry the exact lines; older ones only the count
        return Array.isArray(r.lines) && r.lines.length
          ? `${r.ticket ? `ticket ${r.ticket} · ` : ''}${(r.lines as string[]).join(', ')}`
          : `${r.items} ${t('items')}${r.ticket ? ` · ticket ${r.ticket}` : ''}`
      case 'take_over':
        return `${lang === 'fr' ? 'de' : 'from'} ${nameOf(r.from)}`
      case 'split':
        return Array.isArray(r.into) ? `→ ${(r.into as string[]).join(' · ')}` : ''
      case 'remove_items':
        return Array.isArray(r.items) ? (r.items as string[]).join(', ') : ''
      case 'void_item':
        return `${r.qty ?? ''}× ${r.name ?? ''}`.trim()
      case 'discount':
        return `-${r.discount}%${r.vip ? ` · ${r.vip}` : ''}${r.staff ? ' · staff' : ''}`
      case 'friend_set':
        return `${r.friend}${r.discount ? ` · -${r.discount}%` : ''}`
      case 'friend_debt':
        return `${r.friend} · ${money0(r.amount)} · ${r.method === 'cash' ? t('cash') : t('card')}`
      case 'price':
        return `${r.name}: ${money0(r.from)} → ${money0(r.to)}`
      case 'stock':
        return `${r.name} · ${r.available ? t('available') : t('outOfStock')}`
      case 'friend_add':
      case 'friend_rename':
      case 'friend_remove':
        return String(r.name ?? '')
      case 'report_request':
      case 'report_print':
      case 'report_approve':
      case 'report_deny':
        return [r.scope, r.period].filter(Boolean).join(' · ')
      default:
        return ''
    }
  })()

  return (
    <div className="border-b border-line py-2.5 text-[13px]">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="font-semibold">{who?.name ?? '—'}</span>{' '}
          <span className="text-ink-2">
            {actLabel}
            {l.table_ref && ` · ${l.table_ref}`}
          </span>
          {d.reason && (
            <span className="ml-1.5 rounded-full bg-red-50 px-2 py-px text-[11px] font-bold text-danger">
              {d.reason}
            </span>
          )}
        </span>
        <span className="tnum shrink-0 text-xs text-ink-3">{dateLabel(l.at, lang)}</span>
      </div>

      {/* generic detail line for actions without a custom block below */}
      {summary && <div className="mt-1 text-xs text-ink-2">{summary}</div>}

      {/* transfer detail */}
      {l.action === 'transfer' && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-2">
          <span className="font-semibold">→ {d.to}</span>
          {Array.isArray(d.items) && d.items.length ? (
            <span className="text-ink-3">· {(d.items as unknown as string[]).join(', ')}</span>
          ) : null}
        </div>
      )}

      {/* payment breakdown */}
      {l.action === 'pay' && d.kind && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-2">
          <span className="rounded-full bg-surface-2 px-2 py-px font-semibold">{t(payKindKey[d.kind])}</span>
          {d.kind === 'equal' && d.parts && (
            <span>
              · {d.parts} {t('parts')}
            </span>
          )}
          {d.kind === 'items' && d.itemNames?.length ? <span>· {d.itemNames.join(', ')}</span> : null}
          <span>· {d.method === 'cash' ? t('cash') : t('card')}</span>
          <span className="tnum font-semibold">· {money(d.amount ?? 0)}</span>
          {(d.remainingAfter ?? 0) > 0 && (
            <span className="text-ink-3">
              · {money(d.remainingAfter ?? 0)} {t('remainingWord')}
            </span>
          )}
        </div>
      )}

      {/* closed-table bill */}
      {l.action === 'close_table' && (
        <div className="mt-1">
          <button
            onClick={() => setShowBill((v) => !v)}
            className="text-xs font-semibold text-accent underline-offset-2 hover:underline"
          >
            {t('finalBill')} · {money(d.total ?? 0)}
          </button>
          {showBill && d.items && (
            <div className="anim-fade mt-1.5 rounded-lg bg-surface-2 px-3 py-2">
              {d.items.map((it, idx) => (
                <div key={idx} className="flex justify-between py-0.5 text-xs">
                  <span>
                    {it.qty}× {it.name}
                  </span>
                  <span className="tnum">{money(it.price * it.qty)}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t border-dashed border-line pt-1 text-xs font-bold">
                <span>{t('total')}</span>
                <span className="tnum">{money(d.total ?? 0)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ---------------- friends (admin: owed, breakdown, backlog, archives) ---------------- */
/**
 * The SERVICE day (05:00 → 05:00) a moment belongs to, as YYYY-MM-DD — the
 * same key `friend_debts.incurred_on` is written with. It must NOT be the
 * plain calendar date: period bounds are 05:00 boundaries, so the end of
 * "today" is 04:59 tomorrow, whose CALENDAR date is already the next day.
 * Comparing that against a service-day key dragged the following night's
 * tabs into today's friends figure (and dropped tonight's after-midnight
 * ones out of it).
 */
const dayKey = (d: Date) => localDay(d.toISOString())

function FriendsAdmin({ branch }: { branch: BranchScope }) {
  const { friends } = useData()
  const t = useI18n((s) => s.t)
  const [friendId, setFriendId] = useState<'all' | string>('all')
  const [view, setView] = useState<'open' | 'archive'>('open')
  const [period, setPeriod] = useState<Period>({ kind: 'month' })
  const [manageOpen, setManageOpen] = useState(false)
  const [debts, setDebts] = useState<FriendDebt[]>([])
  const tick = useData((s) => s.friendDebts) // refetch when the live tabs move

  useEffect(() => {
    let alive = true
    // Debts are SHARED across branches: one guest, one running tab, wherever
    // they ate — so this is never filtered by branch. The switcher only
    // changes which bills are HIGHLIGHTED (see the badge on each row).
    supabase
      .from('friend_debts')
      .select('*')
      .order('incurred_on', { ascending: false })
      .then(({ data }) => {
        if (alive) setDebts((data ?? []) as FriendDebt[])
      })
    return () => {
      alive = false
    }
  }, [tick])

  const [from, to] = periodRange(period)
  const fromS = dayKey(from)
  const toIncl = dayKey(new Date(to.getTime() - 1)) // half-open range -> last covered day

  const filtered = debts.filter(
    (d) =>
      d.settled === (view === 'archive') &&
      (friendId === 'all' || d.friend_id === friendId) &&
      (!branch || d.branch === branch) &&
      d.incurred_on >= fromS &&
      d.incurred_on <= toIncl,
  )
  const total = filtered.reduce((s, d) => s + d.amount, 0)
  const perFriend = friends
    .map((f) => {
      const mine = filtered.filter((d) => d.friend_id === f.id)
      return { friend: f, amount: mine.reduce((s, d) => s + d.amount, 0), count: mine.length }
    })
    .sort((a, b) => b.amount - a.amount)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PeriodBar period={period} setPeriod={setPeriod} withAll />

      {/* who + which list. A dropdown rather than chips: the friend list
          grows, and wrapped chips ate three rows on a phone. */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={friendId}
          onChange={(e) => setFriendId(e.target.value as 'all' | string)}
          className="min-h-10 min-w-40 flex-1 rounded-full border border-line-2 bg-surface-2 px-4 text-[14px] font-bold text-ink outline-none focus:border-accent"
        >
          <option value="all">{t('allFriends')}</option>
          {friends.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <div className="flex shrink-0 rounded-full bg-surface-2 p-1">
          {(['open', 'archive'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`min-h-9 rounded-full px-4 text-[13px] font-semibold whitespace-nowrap transition-all ${
                view === v ? 'bg-surface shadow-(--shadow-1)' : 'text-ink-3'
              }`}
            >
              {v === 'open' ? t('owed') : t('friendArchive')}
            </button>
          ))}
        </div>
      </div>

      <Btn onClick={() => setManageOpen(true)}>
        <span className="inline-flex items-center gap-1.5">
          <Users size={15} /> {t('manageFriends')}
        </span>
      </Btn>

      <StatCard
        k={view === 'open' ? t('totalOwed') : t('friendArchive')}
        v={money(total)}
        s={`${filtered.length} ${t('ordersCount').toLowerCase()}`}
        accent={view === 'open'}
      />

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-3">{view === 'open' ? t('noOwed') : t('noOrders')}</p>
      ) : friendId === 'all' ? (
        // per-friend totals — tap to drill into their bills
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-(--shadow-1)">
          {perFriend
            .filter((p) => p.count > 0)
            .map((p) => (
              <button
                key={p.friend.id}
                onClick={() => setFriendId(p.friend.id)}
                className="flex w-full items-center justify-between gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-surface-2"
              >
                <span className="text-[14.5px] font-bold">{p.friend.name}</span>
                <span className="tnum text-[15px] font-extrabold">{money(p.amount)}</span>
              </button>
            ))}
        </div>
      ) : (
        // one friend's individual bills, most recent first
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-(--shadow-1)">
          {filtered.map((d) => (
            <DebtRow key={d.id} debt={d} archived={view === 'archive'} />
          ))}
        </div>
      )}

      {manageOpen && <ManageFriendsModal friends={friends} onClose={() => setManageOpen(false)} />}
    </div>
  )
}

/**
 * One bill on a friend's tab. Tap it to see WHAT they had that month —
 * backlog rows carry the old paper receipt in `note` (comma-separated),
 * while a bill taken in the app links to its session, whose items are
 * fetched on demand with their prices.
 */
function DebtRow({ debt: d, archived }: { debt: FriendDebt; archived: boolean }) {
  const t = useI18n((s) => s.t)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<OrderItem[] | null>(null)

  // Every debt carries a text snapshot of the meal in `note` (typed for
  // backlog rows, written automatically for app bills). The linked session
  // is preferred when it still exists because it has per-line prices; the
  // snapshot is the fallback that survives a deleted order.
  const noteLines = (d.note ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
  const hasDetail = noteLines.length > 0 || !!d.session_id

  useEffect(() => {
    if (!open || items || !d.session_id) return
    let alive = true
    supabase
      .from('order_items')
      .select('*')
      .eq('session_id', d.session_id)
      .eq('voided', false)
      .order('created_at')
      .then(({ data }) => {
        if (alive) setItems((data ?? []) as OrderItem[])
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, d.session_id])

  return (
    <div className="border-b border-line last:border-0">
      <button
        onClick={() => hasDetail && setOpen((v) => !v)}
        disabled={!hasDetail}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left enabled:hover:bg-surface-2"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
            {hasDetail && (
              <ChevronRight
                size={14}
                className={`shrink-0 text-ink-3 transition-transform ${open ? 'rotate-90' : ''}`}
              />
            )}
            {d.backlog ? `${d.incurred_on.slice(0, 7)} · ${t('addBacklog').toLowerCase()}` : d.incurred_on}
          </span>
          <span className="block text-[11.5px] text-ink-3">
            {d.method === 'cash' ? t('cash') : t('card')}
            {archived && d.settled_at ? ` · ${t('settledOn')} ${d.settled_at.slice(0, 10)}` : ''}
            {noteLines.length > 0 ? ` · ${noteLines.length} ${t('items')}` : ''}
          </span>
        </span>
        <span className="tnum shrink-0 text-[15px] font-extrabold">{money(d.amount)}</span>
      </button>

      {open && (
        <div className="anim-fade border-t border-dashed border-line bg-surface-2 px-4 py-2.5">
          {d.session_id && items === null ? (
            <p className="py-1 text-[13px] text-ink-3">{t('loading')}</p>
          ) : items && items.length > 0 ? (
            // live session: itemised WITH prices
            items.map((i) => (
              <div key={i.id} className="flex justify-between gap-3 py-0.5 text-[13px]">
                <span className="min-w-0 truncate">
                  {i.qty}× {i.name}
                </span>
                <span className="tnum shrink-0 text-ink-2">{money(i.price * i.qty)}</span>
              </div>
            ))
          ) : noteLines.length > 0 ? (
            // snapshot taken when the tab was billed (or typed for backlog)
            noteLines.map((line, i) => (
              <div key={i} className="py-0.5 text-[13px]">
                • {line}
              </div>
            ))
          ) : (
            <p className="py-1 text-[13px] text-ink-3">{t('noItems')}</p>
          )}
        </div>
      )}
    </div>
  )
}

/** Add, rename and retire the friends the caisse can put a tab on.
 * Removing deactivates rather than deletes, so a friend's past tabs and
 * settled history survive. */
function ManageFriendsModal({ friends, onClose }: { friends: Friend[]; onClose: () => void }) {
  const user = useAuth((s) => s.user)!
  const t = useI18n((s) => s.t)
  const [adding, setAdding] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setErr('')
    try {
      await fn()
    } catch (e) {
      console.error('[friends] failed:', e)
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  const field =
    'min-h-11 w-full rounded-xl border border-line-2 bg-surface-2 px-3 text-[14.5px] outline-none focus:border-accent'

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-bold">{t('manageFriends')}</h2>
      <p className="mt-1 text-[13px] text-ink-3">{t('manageFriendsHint')}</p>

      <div className="mt-4 flex max-h-[45vh] flex-col gap-2 overflow-y-auto">
        {friends.map((f) => (
          <div key={f.id} className="flex items-center gap-2">
            {editId === f.id ? (
              <>
                <input
                  autoFocus
                  className={field}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setEditId(null)
                    if (e.key === 'Enter' && draft.trim()) {
                      void run(async () => {
                        await renameFriend(f.id, draft, user.id)
                        setEditId(null)
                      })
                    }
                  }}
                />
                <Btn
                  variant="primary"
                  disabled={busy || !draft.trim()}
                  onClick={() =>
                    void run(async () => {
                      await renameFriend(f.id, draft, user.id)
                      setEditId(null)
                    })
                  }
                >
                  {t('save')}
                </Btn>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{f.name}</span>
                <button
                  onClick={() => {
                    setEditId(f.id)
                    setDraft(f.name)
                  }}
                  aria-label={t('editStaff')}
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2 hover:bg-line"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => {
                    if (!window.confirm(`${t('friendRemoveConfirm')} (${f.name})`)) return
                    void run(() => removeFriend(f.id, user.id))
                  }}
                  aria-label={t('friendRemove')}
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-danger hover:bg-line"
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </div>
        ))}
        {friends.length === 0 && (
          <p className="py-4 text-center text-[13px] text-ink-3">{t('friendNone')}</p>
        )}
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <span className="mb-1.5 block text-xs font-bold text-ink-2">{t('friendAdd')}</span>
        <div className="flex gap-2">
          <input
            className={field}
            value={adding}
            placeholder={t('fullName')}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && adding.trim()) {
                void run(async () => {
                  await createFriend(adding, user.id)
                  setAdding('')
                })
              }
            }}
          />
          <Btn
            variant="primary"
            disabled={busy || !adding.trim()}
            onClick={() =>
              void run(async () => {
                await createFriend(adding, user.id)
                setAdding('')
              })
            }
          >
            <Plus size={16} />
          </Btn>
        </div>
      </div>

      {err && <p className="mt-2 text-[12px] text-danger">{err}</p>}
      <Btn className="mt-4 w-full" onClick={onClose}>
        {t('close')}
      </Btn>
    </Modal>
  )
}


/** Friends bills for the selected period — same modal style as VIP/Staff. */
function FriendDebtsModal({
  debts,
  friends,
  onClose,
}: {
  debts: FriendDebt[]
  friends: Friend[]
  onClose: () => void
}) {
  const t = useI18n((s) => s.t)
  const nameOf = (fid: string) => friends.find((f) => f.id === fid)?.name ?? '—'
  const total = debts.reduce((s, d) => s + d.amount, 0)
  const ordered = [...debts].sort((a, b) => b.incurred_on.localeCompare(a.incurred_on))

  return (
    <Modal onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-lg font-bold">
            <Users size={18} /> {t('friends')}
          </h2>
          <p className="mt-1 text-[13px] text-ink-3">
            {debts.length} {t('ordersCount').toLowerCase()} · {money(total)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex max-h-[60vh] flex-col gap-2.5 overflow-y-auto">
        {ordered.map((d) => (
          <div key={d.id} className="rounded-2xl border border-line bg-surface-2 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-[14.5px] font-bold">{nameOf(d.friend_id)}</span>
                <span className="block text-[12px] text-ink-3">
                  {d.backlog ? d.incurred_on.slice(0, 7) : d.incurred_on} ·{' '}
                  {d.method === 'cash' ? t('cash') : t('card')}
                </span>
              </span>
              <span className="tnum shrink-0 text-[15px] font-extrabold">{money(d.amount)}</span>
            </div>
            {d.note && <p className="mt-2 border-t border-line pt-2 text-[12.5px] text-ink-2">{d.note}</p>}
          </div>
        ))}
      </div>

      <Btn className="mt-4 w-full" onClick={onClose}>
        {t('close')}
      </Btn>
    </Modal>
  )
}
