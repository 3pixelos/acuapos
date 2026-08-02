import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRightLeft,
  Package,
  Banknote,
  Calculator,
  Check,
  CheckCircle2,
  ChefHat,
  CreditCard,
  Delete,
  FileText,
  Link2,
  ListChecks,
  Lock,
  LockOpen,
  MinusCircle,
  Printer,
  PrinterCheck,
  Settings2,
  Split,
  Trash2,
  Unlink,
  Users,
} from 'lucide-react'
import { TopBar } from '../components/TopBar'
import { buildTileViews, FloorMap, useNow, type TileView } from '../components/FloorMap'
import { Btn, Drawer, LayerSwitcher, Legend, Modal, StatusChip } from '../components/ui'
import { OrderDrawer, SeatModal } from '../components/order'
import { AvailabilityManager } from '../components/stock'
import { SalesReportModal } from '../components/salesReport'
import { useAuth } from '../state/auth'
import { sessionPaid, sessionTotal, useData } from '../state/data'
import {
  caisseRemoveUnits,
  clearSessionFriend,
  recordFriendDebt,
  requestCancelSession,
  freeSession,
  joinTablesMulti,
  lockSession,
  logPrintBill,
  recordPayment,
  reopenSession,
  seatTable,
  setSessionDiscount,
  setSessionFriend,
  setSessionFriendVip,
  settleFriendDebts,
  splitMerge,
  sweepDuplicateSessions,
  sweepStaleWaiting,
  transferItems,
} from '../state/actions'
import type { BillStation } from '../lib/print'
import { printBill, printFriendStatement } from '../lib/print'
import { inTauri, listPrinters } from '../lib/tauri'
import { usePrinter, type PaperWidth } from '../state/printer'
import { money } from '../lib/format'
import { todayKey } from '../lib/serviceDay'
import { useI18n } from '../lib/i18n'
import type { Friend, FriendDebt, LayerId, TableSession } from '../lib/types'
import { BAR_LAYER, BRANCH_LAYERS, labelsFor, visualStatus } from '../lib/types'

export function CaisseHome() {
  const user = useAuth((s) => s.user)!
  const { tables, sessions, items, staff } = useData()
  const now = useNow()
  const t = useI18n((s) => s.t)
  // First room of the location.
  const [layer, setLayer] = useState<LayerId>(BRANCH_LAYERS[user.branch][0])
  const [openId, setOpenId] = useState<string | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [seatFor, setSeatFor] = useState<string[] | null>(null)
  const [joinSel, setJoinSel] = useState<string[] | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [stockOpen, setStockOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [friendsView, setFriendsView] = useState(false)
  // Same memoized-tile caveat as WaiterHome: onTap must read the join
  // selection through a ref, never the state variable directly.
  const joinSelRef = useRef(joinSel)
  joinSelRef.current = joinSel

  const views = useMemo(
    () =>
      buildTileViews(
        tables.filter((tb) => tb.layer === layer).sort((a, b) => a.sort - b.sort),
        tables,
        sessions,
        items,
        staff,
        now,
      ),
    [tables, sessions, items, staff, now, layer],
  )
  const openSession = sessions.find((s) => s.id === openId && !s.closed_at) ?? null
  const orderSession = sessions.find((s) => s.id === orderId && !s.closed_at) ?? null

  // Auto-free tables stuck "en attente" (seated, never ordered) for over an
  // hour — the till is the always-on device, so it owns this sweep; realtime
  // frees the table on every other screen too.
  useEffect(() => {
    void sweepStaleWaiting()
    const id = setInterval(() => void sweepStaleWaiting(), 60_000)
    return () => clearInterval(id)
  }, [])

  // Clear away empty duplicate sessions on a table (two people seating it in
  // the same instant). Runs often and starts immediately: a stray left in
  // place resurfaces as a phantom occupied table the moment the real one is
  // freed. Only ever closes sessions with no order, no money and no editor.
  useEffect(() => {
    void sweepDuplicateSessions()
    const id = setInterval(() => void sweepDuplicateSessions(), 15_000)
    return () => clearInterval(id)
  }, [])

  const maxCoversFor = (ids: string[]) =>
    ids.reduce((n, id) => n + (tables.find((tb) => tb.id === id)?.seats ?? 0), 0)

  const onTap = (v: TileView) => {
    if (joinSelRef.current) {
      setJoinSel((sel) => {
        const next = sel!.includes(v.table.id)
          ? sel!.filter((x) => x !== v.table.id)
          : [...sel!, v.table.id]
        return next.length ? next : null
      })
      return
    }
    // free table -> caisse can seat it and take the order itself
    if (!v.session) return setSeatFor([v.table.id])
    setOpenId(v.session.id)
  }

  const confirmJoin = async () => {
    if (!joinSel || joinSel.length < 2) return
    const selTiles = views.filter((v) => joinSel.includes(v.table.id))
    const setJoin = joinSel
    setJoinSel(null)
    const sessMap = new Map<string, TableSession>()
    for (const tile of selTiles) if (tile.session) sessMap.set(tile.session.id, tile.session)
    const distinctSessions = [...sessMap.values()]
    const freeIds = selTiles.filter((v) => !v.session).map((v) => v.table.id)

    if (distinctSessions.length === 0) {
      setSeatFor(setJoin) // all free -> seat together
      return
    }
    const [target, ...others] = distinctSessions.sort(
      (a, b) => new Date(a.seated_at).getTime() - new Date(b.seated_at).getTime(),
    )
    await joinTablesMulti(target, others, freeIds)
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar section={t('bill')} />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-3 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <LayerSwitcher layer={layer} setLayer={setLayer} branch={user.branch} />
            {/* the "Amis" tab: switches the floor for the friends' tabs */}
            <button
              onClick={() => setFriendsView((v) => !v)}
              className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-bold transition-all ${
                friendsView ? 'border-transparent bg-emerald-600 text-white' : 'border-line text-ink-2 hover:bg-surface-2'
              }`}
            >
              <Users size={15} /> {t('friends')}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <PrinterStatus />
            {!joinSel && (
              <Btn className="shrink-0" onClick={() => setJoinSel([])}>
                <span className="inline-flex items-center gap-1.5">
                  <Link2 size={15} /> {t('joinSelected')}
                </span>
              </Btn>
            )}
            <button
              onClick={() => setReportOpen(true)}
              aria-label={t('salesReport')}
              className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink-2 hover:bg-surface-2"
            >
              <FileText size={16} />
            </button>
            <button
              onClick={() => setStockOpen(true)}
              aria-label={t('stockTab')}
              className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink-2 hover:bg-surface-2"
            >
              <Package size={16} />
            </button>
            {inTauri() && (
              <button
                onClick={() => setSettingsOpen(true)}
                aria-label={t('printerSettings')}
                className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink-2 hover:bg-surface-2"
              >
                <Settings2 size={16} />
              </button>
            )}
          </div>
        </div>
        {friendsView && <FriendsSettle />}
        {!friendsView && <Legend />}
        {!friendsView && joinSel && (
          <div className="anim-fade flex items-center justify-between gap-2 rounded-xl border border-accent/30 bg-surface px-4 py-2.5 text-[13px] font-semibold shadow-(--shadow-1)">
            <span className="inline-flex items-center gap-2">
              <Link2 size={15} className="text-accent" />
              {joinSel.length ? labelsFor(tables, joinSel) : ''} {joinSel.length ? '— ' : ''}
              {t('joinModeMulti')}
            </span>
            <span className="flex items-center gap-3">
              <button className="font-bold text-ink-3" onClick={() => setJoinSel(null)}>
                {t('cancel')}
              </button>
              <button
                className="rounded-full bg-accent px-3.5 py-1.5 font-bold text-white disabled:opacity-40"
                disabled={joinSel.length < 2}
                onClick={confirmJoin}
              >
                {t('joinSelected')} ({joinSel.length})
              </button>
            </span>
          </div>
        )}
        {!friendsView && (
          <FloorMap
            views={views}
            showWaiter
            highlightWaiterId={user.id}
            selectedIds={joinSel ?? []}
            onTap={onTap}
            onLongPress={(v) => setJoinSel((sel) => sel ?? [v.table.id])}
          />
        )}
      </main>
      {seatFor && (
        <SeatModal
          labels={seatFor.map((id) => tables.find((tb) => tb.id === id)?.label ?? id)}
          maxCovers={maxCoversFor(seatFor)}
          onClose={() => setSeatFor(null)}
          onSeat={async (covers) => {
            const s = await seatTable(seatFor, user.id, covers)
            setSeatFor(null)
            setOrderId(s.id)
          }}
        />
      )}
      {orderSession ? (
        <OrderDrawer
          key={`o-${orderSession.id}`}
          session={orderSession}
          onClose={() => setOrderId(null)}
          onServed={() => {
            // caisse marked it served -> jump straight to checkout
            setOpenId(orderSession.id)
            setOrderId(null)
          }}
        />
      ) : (
        openSession && (
          <BillDrawer
            key={openSession.id}
            session={openSession}
            onClose={() => setOpenId(null)}
            onOrder={() => {
              setOrderId(openSession.id)
              setOpenId(null)
            }}
          />
        )
      )}
      {settingsOpen && <PrinterSettings onClose={() => setSettingsOpen(false)} />}
      {reportOpen && <SalesReportModal onClose={() => setReportOpen(false)} />}
      {stockOpen && (
        <Drawer title={t('stockTab')} onClose={() => setStockOpen(false)}>
          <AvailabilityManager />
        </Drawer>
      )}
    </div>
  )
}

/** Small badge telling the cashier whether kitchen tickets are printing —
 * the only screen anywhere near the kitchen printer. */
function PrinterStatus() {
  const { kitchenOnline, barOnline, printsKitchen, printsBar, queued } = usePrinter()
  const t = useI18n((s) => s.t)
  if (!inTauri()) return null
  const chip = (ok: boolean, okLabel: string, downLabel: string) => (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
        ok ? 'bg-st-served-soft text-st-served' : 'bg-red-100 text-danger'
      }`}
    >
      {ok ? <PrinterCheck size={14} /> : <Printer size={14} />}
      {ok ? okLabel : `${downLabel}${queued > 0 ? ` · ${queued}` : ''}`}
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1.5">
      {/* only the stations THIS till is responsible for — the bar's till has
          no business showing a kitchen badge, and vice versa */}
      {printsKitchen && chip(kitchenOnline, t('kitchenPrinterOk'), t('kitchenPrinterOffline'))}
      {printsBar && chip(barOnline, t('barPrinterOk'), t('barPrinterOffline'))}
    </span>
  )
}

const PRINTER_FIELD =
  'min-h-12 w-full rounded-xl border border-line-2 bg-surface-2 px-3.5 outline-none focus:border-accent'

/**
 * One Windows-printer picker. Both cable-connected printers (the caisse's
 * and the bar's) are chosen this way — they are addressed by the name
 * Windows knows them under, never by an IP. Enumeration can fail (or come
 * back empty on a machine with no printers installed yet), so the control
 * degrades to a free-text box rather than leaving the cashier stuck.
 */
function WindowsPrinterPicker({
  label,
  hint,
  value,
  onChange,
  placeholder,
  printers,
  listErr,
  onRefresh,
}: {
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  printers: string[]
  listErr: string
  onRefresh: () => void
}) {
  const t = useI18n((s) => s.t)
  return (
    <label>
      <span className="mb-1 flex items-center justify-between text-xs font-bold text-ink-2">
        {label}
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-full border border-line-2 px-2.5 py-1 text-[11px] font-bold text-ink-2 hover:bg-surface-2"
        >
          ↻ {t('refreshList')}
        </button>
      </span>
      <p className="mb-1.5 text-[12px] text-ink-3">{hint}</p>
      {printers.length > 0 ? (
        <select className={PRINTER_FIELD} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {/* keep a previously saved printer selectable even if it is
              currently offline / not enumerated */}
          {value && !printers.includes(value) && <option value={value}>{value}</option>}
          {printers.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      ) : (
        // list empty or enumeration failed — type the exact Windows name
        <>
          <input
            className={PRINTER_FIELD}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
          <p className="mt-1 text-[12px] font-semibold text-amber-700">
            {t('printerListEmptyHint')}
          </p>
          {listErr && <p className="mt-1 text-[11px] text-danger">{listErr}</p>}
        </>
      )}
    </label>
  )
}

/** One station on/off row in the printer settings. */
function StationToggle({
  label,
  hint,
  on,
  onChange,
}: {
  label: string
  hint: string
  on: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-all ${
        on ? 'border-accent bg-accent/5' : 'border-line-2 bg-surface-2'
      }`}
    >
      <span
        className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2 ${
          on ? 'border-accent bg-accent text-white' : 'border-line-2'
        }`}
      >
        {on && <Check size={13} strokeWidth={3} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-bold">{label}</span>
        <span className="mt-0.5 block text-[12px] text-ink-3">{hint}</span>
      </span>
    </button>
  )
}

function PrinterSettings({ onClose }: { onClose: () => void }) {
  const {
    kitchenIp,
    barPrinterName,
    cashierPrinterName,
    printsKitchen,
    printsBar,
    paperWidth,
    setConfig,
  } = usePrinter()
  const t = useI18n((s) => s.t)
  const [kip, setKip] = useState(kitchenIp)
  const [bname, setBname] = useState(barPrinterName)
  const [cname, setCname] = useState(cashierPrinterName)
  const [doKitchen, setDoKitchen] = useState(printsKitchen)
  const [doBar, setDoBar] = useState(printsBar)
  const [pw, setPw] = useState<PaperWidth>(paperWidth)
  const [printers, setPrinters] = useState<string[]>([])
  const [listErr, setListErr] = useState('')

  const loadPrinters = () => {
    listPrinters()
      .then((names) => {
        setPrinters(names)
        setListErr('')
      })
      .catch((e) => {
        // enumeration failed — surface it and fall back to manual entry
        setPrinters([])
        setListErr(String(e))
      })
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadPrinters, [])

  return (
    <Modal onClose={onClose}>
      <h2 className="flex items-center gap-2 text-lg font-bold">
        {t('printerSettings')}
      </h2>
      <p className="mt-1 text-[13px] text-ink-3">{t('printerSettingsHint')}</p>
      <div className="mt-4 flex flex-col gap-3">
        {/* Which stations THIS machine prints. The main caisse and the bar's
            caisse both run this app against the same ticket queue, so each
            has to take a different half or every ticket prints twice. */}
        <div>
          <span className="mb-1 block text-xs font-bold text-ink-2">{t('stationsTitle')}</span>
          <p className="mb-2 text-[12px] text-ink-3">{t('stationsHint')}</p>
          <div className="flex flex-col gap-2">
            <StationToggle
              label={t('stationKitchen')}
              hint={t('stationKitchenHint')}
              on={doKitchen}
              onChange={setDoKitchen}
            />
            <StationToggle
              label={t('stationBar')}
              hint={t('stationBarHint')}
              on={doBar}
              onChange={setDoBar}
            />
          </div>
          {!doKitchen && !doBar && (
            <p className="mt-2 text-[12px] font-semibold text-amber-700">{t('stationsNoneWarn')}</p>
          )}
        </div>

        {/* The kitchen printer is the ONLY networked one — it keeps an IP. */}
        {doKitchen && (
          <label>
            <span className="mb-1 block text-xs font-bold text-ink-2">{t('kitchenPrinterIp')}</span>
            <p className="mb-1.5 text-[12px] text-ink-3">{t('kitchenPrinterIpHint')}</p>
            <input
              className={PRINTER_FIELD}
              value={kip}
              inputMode="decimal"
              placeholder="192.168.1.50"
              onChange={(e) => setKip(e.target.value.trim())}
            />
          </label>
        )}
        {/* The bar printer stays configurable even on a till that doesn't
            print bar TICKETS — a Bar-floor addition still comes out of it. */}
        <WindowsPrinterPicker
          label={t('barPrinterName')}
          hint={t('barPrinterNameHint')}
          value={bname}
          onChange={setBname}
          placeholder="BAR-80"
          printers={printers}
          listErr={listErr}
          onRefresh={loadPrinters}
        />
        <WindowsPrinterPicker
          label={t('cashierPrinterName')}
          hint={t('cashierPrinterNameHint')}
          value={cname}
          onChange={setCname}
          placeholder="POS-80"
          printers={printers}
          listErr={listErr}
          onRefresh={loadPrinters}
        />
        <div>
          <span className="mb-1.5 block text-xs font-bold text-ink-2">{t('paperWidth')}</span>
          <div className="flex gap-2">
            {([80, 58] as PaperWidth[]).map((w) => (
              <button
                key={w}
                onClick={() => setPw(w)}
                className={`h-11 flex-1 rounded-xl border text-[15px] font-bold transition-all ${
                  pw === w ? 'border-transparent bg-accent text-white' : 'border-line-2 bg-surface-2'
                }`}
              >
                {w} mm
              </button>
            ))}
          </div>
        </div>
        <div className="mt-1 flex gap-2.5">
          <Btn className="flex-1" onClick={onClose}>
            {t('cancel')}
          </Btn>
          <Btn
            variant="primary"
            className="flex-1"
            onClick={() => {
              setConfig({
                kitchenIp: kip,
                barPrinterName: bname,
                cashierPrinterName: cname,
                printsKitchen: doKitchen,
                printsBar: doBar,
                paperWidth: pw,
              })
              onClose()
            }}
          >
            {t('save')}
          </Btn>
        </div>
      </div>
    </Modal>
  )
}

type Mode = 'none' | 'equal' | 'items' | 'transfer' | 'remove'

function BillDrawer({
  session,
  onClose,
  onOrder,
}: {
  session: TableSession
  onClose: () => void
  onOrder: () => void
}) {
  const user = useAuth((s) => s.user)!
  const { items, payments, tables, sessions, friends, friendDebts } = useData()
  const t = useI18n((s) => s.t)
  const now = useNow()
  const [mode, setMode] = useState<Mode>('none')
  const [parts, setParts] = useState(2)
  const [equalBase, setEqualBase] = useState(0)
  const [selectedUnits, setSelectedUnits] = useState<Set<string>>(new Set())
  const [pickTable, setPickTable] = useState(false)
  // In-flight payment guard. On a slow connection recordPayment's network
  // write takes a second, and until it lands `remaining` hasn't dropped —
  // so a cashier who taps "Espèce" again while it's saving would record a
  // SECOND full payment (the duplicate-payment bug). The ref blocks the
  // repeat synchronously (before React can even re-render), the state
  // greys the buttons out.
  const [paying, setPaying] = useState(false)
  const payingRef = useRef(false)
  const [cancelAsk, setCancelAsk] = useState(false)
  const [splitAsk, setSplitAsk] = useState(false)
  const [calcOpen, setCalcOpen] = useState(false)
  const [vipAsk, setVipAsk] = useState(false)
  const [staffAsk, setStaffAsk] = useState(false)
  const [friendAsk, setFriendAsk] = useState(false)
  const [strippedWarn, setStrippedWarn] = useState(0)
  // Remise on the whole bill (percent). Persisted on the session (never
  // local state) so it can't accumulate or resurface after close/reopen;
  // frozen once a payment exists so the remaining balance can't jump.
  const discount = session.discount ?? 0
  const isStaff = session.staff_order === true
  const isFriend = !!session.friend_id
  const friendName = friends.find((f) => f.id === session.friend_id)?.name ?? ''
  // The tab is already on the friend's account — the bill can still be
  // printed, but it must never be booked twice.
  const tabBooked = isFriend && friendDebts.some((d) => d.session_id === session.id)

  const list = items.filter((i) => i.session_id === session.id && !i.voided)
  const discountF = 1 - discount / 100
  const total = sessionTotal(items, session.id) * discountF
  const paid = sessionPaid(payments, session.id)
  const remaining = Math.max(0, total - paid)
  // The bill is done: either a real payment covered the whole balance, or a
  // friend's tab was booked (which records no payment, only a debt). Once
  // this is true the pay buttons are removed, so the same table can't be paid
  // twice by a tap-out-and-back (the duplicate-espèce worry).
  const fullySettled = tabBooked || (paid > 0 && remaining <= 0.5)
  const tableRef = labelsFor(tables, session.table_ids)
  // Which till's printer this addition comes out of. The bar settles its own
  // floor on its own printer; every other room prints at the caisse. A joined
  // session counts as a bar bill only if it is entirely on the bar floor —
  // a bar table merged with a salon one is a caisse bill.
  const sessTables = session.table_ids.map((id) => tables.find((tb) => tb.id === id))
  const billStation: BillStation =
    sessTables.length > 0 && sessTables.every((tb) => tb?.layer === BAR_LAYER) ? 'bar' : 'cashier'
  const served = session.status === 'served'
  const locked = session.locked
  // Any table spanning >1 physical table is a join we can undo — available at
  // any status (even served / bill printed) so a mistaken merge is fixable.
  const isJoined = session.table_ids.length > 1
  // Cancel requested → the table is frozen waiting for an admin to confirm or
  // reject on the map. The caisse must NOT be able to free / reopen / settle
  // it in the meantime (that would bypass the approval), so every action is
  // hidden and only the pending banner shows.
  const pending = session.cancel_requested
  const share = parts > 0 ? equalBase / parts : equalBase
  const partOptions = Array.from({ length: Math.max(1, session.covers - 1) }, (_, i) => i + 2)

  const enterEqual = () => {
    setSelectedUnits(new Set())
    if (mode === 'equal') return setMode('none')
    setEqualBase(remaining)
    setParts(Math.min(2, Math.max(2, session.covers)))
    setMode('equal')
  }
  const toggleMode = (m: Mode) => {
    setSelectedUnits(new Set())
    setMode((cur) => (cur === m ? 'none' : m))
  }

  const unitCounts = () => {
    const m = new Map<string, number>()
    for (const key of selectedUnits) {
      const id = key.slice(0, key.lastIndexOf(':'))
      m.set(id, (m.get(id) ?? 0) + 1)
    }
    return [...m.entries()].map(([itemId, count]) => ({ itemId, count }))
  }
  const selectedTotal =
    [...selectedUnits].reduce((s, key) => {
      const id = key.slice(0, key.lastIndexOf(':'))
      return s + (list.find((i) => i.id === id)?.price ?? 0)
    }, 0) * discountF

  const selectAllUnpaid = () => {
    const s = new Set<string>()
    for (const it of list) for (let u = it.paid_qty; u < it.qty; u++) s.add(`${it.id}:${u}`)
    setSelectedUnits(s)
  }

  const pay = async (method: 'cash' | 'card') => {
    if (payingRef.current) return // a payment is already saving — ignore the repeat tap
    payingRef.current = true
    setPaying(true)
    try {
      // Friends bill: the whole amount goes on the friend's tab as a debt
      // (never revenue), then the table frees. No split/partial for a tab.
      if (isFriend) {
        // books the tab and CLOSES the table; printing and freeing stay
        // in the cashier's hands, same as a normally-paid table
        await recordFriendDebt(session, method, user.id)
        return
      }
      const dmeta = discount ? { discount } : {}
      if (mode === 'items' && selectedUnits.size) {
        await recordPayment(session, user.id, method, Math.min(selectedTotal, remaining), 'items', unitCounts(), dmeta)
        setSelectedUnits(new Set())
      } else if (mode === 'equal') {
        await recordPayment(session, user.id, method, Math.min(share, remaining), 'equal', [], { parts, ...dmeta })
      } else {
        // Full payment keeps the checkout open — the screen stays on this
        // table (print, close, then Libérer) until the cashier frees it or
        // backs out themselves.
        await recordPayment(session, user.id, method, remaining, 'full', [], dmeta)
      }
    } finally {
      payingRef.current = false
      setPaying(false)
    }
  }

  const doTransfer = async (destTableId: string) => {
    await transferItems(session, unitCounts(), destTableId, user.id)
    setPickTable(false)
    setSelectedUnits(new Set())
    setMode('none')
  }

  const payDisabled =
    paying || tabBooked || remaining <= 0 || (mode === 'items' && selectedTotal <= 0)
  const selectMode = mode === 'items' || mode === 'transfer' || mode === 'remove'

  return (
    <Drawer
      title={`${t('bill')} — ${tableRef}`}
      badge={<StatusChip status={visualStatus(session, now)} />}
      subtitle={`${session.covers} ${t('covers')}`}
      onClose={onClose}
      footer={
        pending ? (
          <p className="py-1 text-center text-[13px] font-semibold text-danger">
            {t('cancelPendingBanner')}
          </p>
        ) : mode === 'remove' ? (
          <Btn
            variant="danger"
            className="w-full"
            disabled={selectedUnits.size === 0}
            onClick={async () => {
              if (!window.confirm(`${t('removeItemsConfirm')} (${selectedUnits.size})`)) return
              await caisseRemoveUnits(session, unitCounts(), user.id)
              setSelectedUnits(new Set())
              setMode('none')
            }}
          >
            <span className="inline-flex items-center gap-1.5">
              <MinusCircle size={16} /> {t('removeItems')} ({selectedUnits.size})
            </span>
          </Btn>
        ) : mode === 'transfer' ? (
          <Btn
            variant="primary"
            className="w-full"
            disabled={selectedUnits.size === 0}
            onClick={() => setPickTable(true)}
          >
            <span className="inline-flex items-center gap-1.5">
              <ArrowRightLeft size={16} /> {t('transferTo')}
            </span>
          </Btn>
        ) : !served ? (
          <p className="py-1 text-center text-[13px] font-medium text-ink-3">{t('waitServed')}</p>
        ) : fullySettled ? (
          // The bill is fully settled — the balance reached zero (or the
          // friend's tab was booked). Show a clear PAID state INSTEAD of the
          // pay buttons: with the buttons gone entirely, a cashier who taps
          // Espèce, tabs away and comes back can't tap it a second time and
          // wonder if it double-counted. Freeing / reopening still live below.
          <div className="flex items-center justify-center gap-2 rounded-xl bg-st-served-soft py-3 text-[14px] font-bold text-st-served">
            <CheckCircle2 size={18} /> {t('paidInFull')} · {money(tabBooked ? total : paid)}
          </div>
        ) : (
          <div>
            {paid > 0 && (
              <div className="mb-2 flex items-center justify-between text-[13px] font-semibold">
                <span className="inline-flex items-center gap-1.5 text-st-served">
                  <CheckCircle2 size={15} /> {t('paid')} {money(paid)}
                </span>
                <span className="tnum text-ink-2">
                  {t('remaining')} {money(remaining)}
                </span>
              </div>
            )}
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-3">
                {mode === 'items'
                  ? t('paySelected')
                  : mode === 'equal'
                    ? `${parts} × ${money(share)} ${t('perPerson')}`
                    : t('total')}
              </span>
              <span className="tnum text-xl font-extrabold">
                {money(mode === 'items' ? selectedTotal : mode === 'equal' ? Math.min(share, remaining) : remaining)}
              </span>
            </div>
            <div className="flex gap-2.5">
              <button
                onClick={() => setCalcOpen(true)}
                aria-label={t('changeCalc')}
                className="grid min-h-12 w-13 shrink-0 place-items-center rounded-xl border border-line-2 bg-surface-2 text-ink-2 transition-all active:scale-95"
              >
                <Calculator size={18} />
              </button>
              <Btn variant="outline" className="flex-1" disabled={payDisabled} onClick={() => pay('cash')}>
                <span className="inline-flex items-center gap-1.5">
                  <Banknote size={16} /> {t('cash')}
                </span>
              </Btn>
              <Btn variant="primary" className="flex-1" disabled={payDisabled} onClick={() => pay('card')}>
                <span className="inline-flex items-center gap-1.5">
                  <CreditCard size={16} /> {t('card')}
                </span>
              </Btn>
            </div>
          </div>
        )
      }
    >
      {locked && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-slate-100 px-3.5 py-2.5 text-[13px] font-semibold text-slate-600">
          <Lock size={15} /> {t('st_closed')}
        </div>
      )}

      {/* items — one row PER UNIT so a single Coke of three can be paid alone */}
      {list.length === 0 && <p className="py-8 text-center text-sm text-ink-3">{t('noItems')}</p>}
      {list.map((it) =>
        Array.from({ length: it.qty }).map((_, u) => {
          const key = `${it.id}:${u}`
          const isPaid = u < it.paid_qty
          const checked = selectedUnits.has(key)
          const selectable = selectMode && !isPaid
          return (
            <label
              key={key}
              className={`flex items-center justify-between gap-3 border-b border-line py-2.5 ${
                isPaid ? 'opacity-45' : ''
              } ${selectable ? 'cursor-pointer' : ''}`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                {selectable && (
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      setSelectedUnits((s) => {
                        const n = new Set(s)
                        if (e.target.checked) n.add(key)
                        else n.delete(key)
                        return n
                      })
                    }
                    className="size-4.5 accent-stone-900"
                  />
                )}
                <span className="truncate text-[14px] font-medium">
                  {it.name}
                  {isPaid && <span className="ml-2 text-[11px] font-bold text-st-served">✓ {t('paid')}</span>}
                </span>
              </span>
              <span className="tnum text-[14px] font-semibold">{money(it.price)}</span>
            </label>
          )
        }),
      )}

      {/* the table's tab is settled (closed AND balance at zero) — freeing
          it is the main thing caisse still needs to do, so it gets
          full-width, high-contrast treatment instead of blending into the
          small icon grid below */}
      {!pending && served && locked && (remaining <= 0 || tabBooked) && (
        <Btn
          variant="success"
          className="mt-5 w-full min-h-14 text-[15px]"
          onClick={() => freeSession(session, user.id)}
        >
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 size={19} /> {t('freeTable')}
          </span>
        </Btn>
      )}

      {/* actions — clean full-width rows: primary (payment) row first once
          served, secondary row below it; before serving it's take-control +
          transfer side by side with cancel underneath */}
      {/* remise on the whole bill — feeds every payment mode + the receipt */}
      {!pending && served && list.length > 0 && (
        <div className="mt-4">
          <span className="mb-1.5 block text-xs font-bold text-ink-3 uppercase">{t('discount')}</span>
          <div className="flex gap-2">
            {([0, 20, 30, 40] as const).map((d) => {
              // a plain remise, NOT the staff meal (which is also 40%)
              const active = discount === d && !isStaff && !isFriend
              return (
                <button
                  key={d}
                  disabled={isFriend || (paid > 0 && !active)}
                  onClick={() => void setSessionDiscount(session, d, user.id)}
                  className={`h-11 flex-1 rounded-xl border text-[13px] font-bold transition-all disabled:opacity-35 ${
                    active ? 'border-transparent bg-accent text-white' : 'border-line-2 bg-surface-2'
                  }`}
                >
                  {d === 0 ? t('noDiscount') : `-${d}%`}
                </button>
              )
            })}
          </div>
          {/* VIP (comped) + Staff (-40%, out of revenue) + Friends (whole bill
              goes on the friend's tab as a debt — never revenue) */}
          <div className="mt-2 flex gap-2">
            <button
              disabled={isFriend || (paid > 0 && discount !== 100)}
              onClick={() => setVipAsk(true)}
              className={`h-11 flex-1 rounded-xl border text-[13px] font-bold transition-all disabled:opacity-35 ${
                discount === 100 ? 'border-transparent bg-stone-900 text-white' : 'border-line-2 bg-surface-2'
              }`}
            >
              VIP
            </button>
            <button
              disabled={isFriend || (paid > 0 && !isStaff)}
              onClick={() => setStaffAsk(true)}
              className={`h-11 flex-1 rounded-xl border text-[13px] font-bold transition-all disabled:opacity-35 ${
                isStaff ? 'border-transparent bg-indigo-600 text-white' : 'border-line-2 bg-surface-2'
              }`}
            >
              {t('staffOrder')}
            </button>
            <button
              onClick={() => setFriendAsk(true)}
              className={`h-11 flex-1 truncate rounded-xl border px-1 text-[13px] font-bold transition-all ${
                isFriend ? 'border-transparent bg-emerald-600 text-white' : 'border-line-2 bg-surface-2'
              }`}
            >
              {isFriend ? friendName : t('friends')}
            </button>
          </div>
          {isFriend && (
            <p className="mt-2 text-[12px] font-semibold text-emerald-700">{t('friendTabHint')}</p>
          )}
        </div>
      )}

      {/* printing IS closing: one tap prints the bill and locks the table —
          but nothing else changes on screen; split/pay stay available and
          "free the table" only appears once the balance reaches zero. */}
      {!pending && served && list.length > 0 && (
        <div className="mt-3 flex gap-2">
          <ActionCard
            icon={<Printer size={17} />}
            label={t('printBill')}
            onClick={async () => {
              try {
                const n = await printBill(
                  tableRef,
                  list,
                  {
                    cashier: user.name,
                    payments: payments.filter((p) => p.session_id === session.id),
                    discount,
                  },
                  billStation,
                )
                logPrintBill(session, user.id)
                if (n > 0) setStrippedWarn(n)
              } catch (e) {
                console.error('[bill-print] failed:', e)
              }
              await lockSession(session, user.id)
            }}
          />
          <ActionCard icon={<Split size={17} />} label={t('splitEqual')} active={mode === 'equal'} onClick={enterEqual} />
          <ActionCard
            icon={<ListChecks size={17} />}
            label={t('splitItems')}
            active={mode === 'items'}
            onClick={() => toggleMode('items')}
          />
        </div>
      )}
      {strippedWarn > 0 && (
        <div className="mt-2 flex items-center justify-between rounded-xl bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800">
          <span>{strippedWarn} {t('billStripped')}</span>
          <button className="ml-2 text-amber-600 underline" onClick={() => setStrippedWarn(0)}>OK</button>
        </div>
      )}
      {!pending && (
      <div className="mt-2 flex gap-2">
        {/* take control: the table becomes the cashier's — they can add
            anything to the order (caisse is the only role that can cancel) */}
        {!locked && (
          <ActionCard
            icon={<ChefHat size={17} />}
            label={session.waiter_id === user.id ? t('addOrder') : t('takeControl')}
            onClick={() => {
              // La caisse is THE exception: it can add to any table at any time.
              // It deliberately does NOT take the table over (waiter_id is left
              // alone), so the waiter who claimed it keeps their edit rights and
              // the sale stays credited to them. It just opens the order screen.
              onOrder()
            }}
          />
        )}
        {served && locked && (
          <ActionCard
            icon={<LockOpen size={17} />}
            label={t('reopenTable')}
            onClick={() => reopenSession(session, user.id)}
          />
        )}
        {list.length > 0 && (
          <ActionCard
            icon={<ArrowRightLeft size={17} />}
            label={t('transfer')}
            active={mode === 'transfer'}
            onClick={() => toggleMode('transfer')}
          />
        )}
        {/* undo a join — return each table its own items, even after serving
            or once the bill is out (each piece comes back on its own) */}
        {isJoined && (
          <ActionCard
            icon={<Unlink size={17} />}
            label={t('separateTables')}
            onClick={() => setSplitAsk(true)}
          />
        )}
        {/* remove units without cancelling the table — available at every
            status (only unpaid units are selectable) */}
        {list.length > 0 && (
          <ActionCard
            icon={<MinusCircle size={17} />}
            label={t('removeItems')}
            active={mode === 'remove'}
            onClick={() => toggleMode('remove')}
          />
        )}
      </div>
      )}

      {mode === 'equal' && (
        <div className="anim-fade mt-4">
          <div className="grid grid-cols-6 gap-2">
            {partOptions.map((n) => (
              <button
                key={n}
                onClick={() => setParts(n)}
                className={`h-11 rounded-xl border text-[15px] font-bold transition-all ${
                  parts === n ? 'border-transparent bg-accent text-white' : 'border-line-2 bg-surface-2'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'transfer' && (
        <div className="anim-fade mt-3">
          <Btn className="w-full" onClick={selectAllUnpaid}>
            {t('transferWhole')}
          </Btn>
        </div>
      )}

      {paid > 0 && (
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-st-served transition-all duration-300"
            style={{ width: `${Math.min(100, (paid / total) * 100)}%` }}
          />
        </div>
      )}

      {/* cancel the table — caisse can cancel at ANY status (en attente,
          commande en cours, or servie); the customer may leave / a mistake
          may surface at any point. Cancelling doesn't free the table: it goes
          red until an admin confirms it on the admin map. */}
      {session.cancel_requested ? (
        <div className="mt-4 mb-2 flex items-center gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-[13px] font-semibold text-red-700">
          <Trash2 size={15} /> {t('cancelPendingBanner')}
        </div>
      ) : (
        <div className="mt-2 mb-2">
          <Btn variant="danger" className="w-full" onClick={() => setCancelAsk(true)}>
            <span className="inline-flex items-center gap-1.5">
              <Trash2 size={15} /> {t('cancelOrder')}
            </span>
          </Btn>
        </div>
      )}

      {pickTable && (
        <TablePicker
          tables={tables}
          sessions={sessions}
          sourceTableId={session.table_ids[0]}
          excludeIds={session.table_ids}
          onClose={() => setPickTable(false)}
          onPick={doTransfer}
        />
      )}
      {calcOpen && (
        <ChangeCalcModal
          due={mode === 'items' ? selectedTotal : mode === 'equal' ? Math.min(share, remaining) : remaining}
          onClose={() => setCalcOpen(false)}
        />
      )}
      {vipAsk && (
        <VipNameModal
          initial={session.vip_name ?? ''}
          onClose={() => setVipAsk(false)}
          onConfirm={(name) => {
            void setSessionDiscount(session, 100, user.id, name)
            setVipAsk(false)
          }}
        />
      )}
      {staffAsk && (
        <VipNameModal
          initial={session.vip_name ?? ''}
          title={t('staffTitle')}
          hint={t('staffHint')}
          label={t('staffName')}
          onClose={() => setStaffAsk(false)}
          onConfirm={(name) => {
            void setSessionDiscount(session, 40, user.id, name, true)
            setStaffAsk(false)
          }}
        />
      )}
      {friendAsk && (
        <FriendPicker
          friends={friends}
          current={session.friend_id}
          onClose={() => setFriendAsk(false)}
          onPick={(fid, pct) => {
            void setSessionFriend(session, fid, user.id, pct)
            setFriendAsk(false)
          }}
          onVip={(name) => {
            void setSessionFriendVip(session, name, user.id)
            setFriendAsk(false)
          }}
          onClear={
            isFriend
              ? () => {
                  void clearSessionFriend(session, user.id)
                  setFriendAsk(false)
                }
              : undefined
          }
        />
      )}
      {cancelAsk && (
        <ReasonModal
          title={`${t('cancelOrder')} — ${tableRef}`}
          label={t('freeReason')}
          onClose={() => setCancelAsk(false)}
          onConfirm={async (reason) => {
            await requestCancelSession(session, user.id, reason)
            setCancelAsk(false)
          }}
        />
      )}

      {splitAsk && (
        <Modal onClose={() => setSplitAsk(false)}>
          <h2 className="inline-flex items-center gap-2 text-lg font-bold">
            <Unlink size={18} /> {t('separateTables')} — {tableRef}
          </h2>
          <p className="mt-2 text-sm text-ink-2">{t('separateTablesHint')}</p>
          <div className="mt-5 flex gap-2.5">
            <Btn className="flex-1" onClick={() => setSplitAsk(false)}>
              {t('cancel')}
            </Btn>
            <Btn
              variant="primary"
              className="flex-1"
              onClick={async () => {
                setSplitAsk(false)
                await splitMerge(session, user.id)
                onClose()
              }}
            >
              {t('confirm')}
            </Btn>
          </div>
        </Modal>
      )}
    </Drawer>
  )
}

/**
 * Quick change calculator: cashier types what the customer handed over,
 * gets the change to give back. Pure arithmetic — records nothing.
 * On-screen numpad so it works the same on the till's touchscreen.
 */
function ChangeCalcModal({ due, onClose }: { due: number; onClose: () => void }) {
  const t = useI18n((s) => s.t)
  const [entry, setEntry] = useState('')

  const received = parseFloat(entry) || 0
  const diff = received - due
  const push = (d: string) => {
    setEntry((e) => {
      if (d === '.' && e.includes('.')) return e
      if (e.length >= 8) return e
      return e + d
    })
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="inline-flex items-center gap-2 text-lg font-bold">
        <Calculator size={18} /> {t('changeCalc')}
      </h2>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3">
        <span className="text-[13px] font-semibold text-ink-3">{t('amountDue')}</span>
        <span className="tnum text-lg font-extrabold">{money(due)}</span>
      </div>
      <div className="mt-2.5 flex items-center justify-between rounded-xl border border-line-2 px-4 py-3">
        <span className="text-[13px] font-semibold text-ink-3">{t('amountReceived')}</span>
        <span className="tnum text-lg font-extrabold">{entry || '0'}</span>
      </div>
      <div
        className={`mt-2.5 flex items-center justify-between rounded-xl px-4 py-3.5 ${
          received === 0
            ? 'bg-surface-2 text-ink-3'
            : diff >= 0
              ? 'bg-st-served-soft text-st-served'
              : 'bg-red-50 text-red-700'
        }`}
      >
        <span className="text-[13px] font-bold">
          {received !== 0 && diff < 0 ? t('missingAmount') : t('changeDue')}
        </span>
        <span className="tnum text-2xl font-extrabold">{money(Math.abs(diff))}</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0'].map((d) => (
          <button
            key={d}
            onClick={() => push(d)}
            className="grid h-13 place-items-center rounded-xl border border-line bg-surface-2 text-lg font-semibold transition-all active:translate-y-0.5"
          >
            {d}
          </button>
        ))}
        <button
          onClick={() => setEntry((e) => e.slice(0, -1))}
          aria-label="⌫"
          className="grid h-13 place-items-center rounded-xl border border-line bg-surface-2 text-ink-3 transition-all active:translate-y-0.5"
        >
          <Delete size={20} />
        </button>
      </div>
      <div className="mt-3 flex gap-2.5">
        <Btn className="flex-1" onClick={() => setEntry('')}>
          C
        </Btn>
        <Btn variant="primary" className="flex-1" onClick={onClose}>
          {t('close')}
        </Btn>
      </div>
    </Modal>
  )
}

function ActionCard({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1 rounded-xl border px-1 text-center text-[11px] font-bold transition-all duration-150 active:scale-[0.98] ${
        active ? 'border-accent bg-accent text-white' : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function TablePicker({
  tables,
  sessions,
  sourceTableId,
  excludeIds,
  onClose,
  onPick,
}: {
  tables: import('../lib/types').RestaurantTable[]
  sessions: TableSession[]
  sourceTableId: string
  excludeIds: string[]
  onClose: () => void
  onPick: (id: string) => void
}) {
  const { lang, t } = useI18n()
  // Single-location: the source table's location decides which rooms exist.
  const branch = tables.find((tb) => tb.id === sourceTableId)?.branch ?? 'main'
  // Default to the source table's own layer, not just whichever table
  // happens to sort first in the full list.
  const [layer, setLayer] = useState<LayerId>(
    (tables.find((tb) => tb.id === sourceTableId)?.layer ?? BRANCH_LAYERS[branch][0]) as LayerId,
  )
  const shown = tables
    .filter((tb) => tb.layer === layer && !excludeIds.includes(tb.id))
    .sort((a, b) => a.sort - b.sort)
  const occupied = (id: string) => sessions.some((s) => !s.closed_at && s.table_ids.includes(id))
  // A table whose bill is already printed/closed (locked) can't receive a
  // transfer — its total is finalised. Block it so nothing slips onto a
  // settled bill.
  const closedTable = (id: string) =>
    sessions.some((s) => !s.closed_at && s.locked && s.table_ids.includes(id))

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-bold">{t('chooseTable')}</h2>
      <div className="mt-3">
        <LayerSwitcher layer={layer} setLayer={setLayer} branch={branch} />
      </div>
      <div className="mt-4 grid max-h-[50vh] grid-cols-4 gap-2 overflow-y-auto">
        {shown.map((tb) => {
          const isClosed = closedTable(tb.id)
          return (
            <button
              key={tb.id}
              disabled={isClosed}
              onClick={() => onPick(tb.id)}
              className={`flex min-h-14 flex-col items-center justify-center rounded-xl border text-[13px] font-bold transition-all active:scale-[0.98] disabled:opacity-45 disabled:active:scale-100 ${
                isClosed
                  ? 'border-line-2 bg-surface-2'
                  : occupied(tb.id)
                    ? 'border-accent/40 bg-accent/5'
                    : 'border-line-2 bg-surface-2'
              }`}
            >
              {tb.vip ? (lang === 'fr' ? 'VIP' : 'VIP') : tb.label}
              {isClosed ? (
                <span className="text-[9px] font-semibold text-danger">{t('st_closed')}</span>
              ) : (
                occupied(tb.id) && (
                  <span className="text-[9px] font-semibold text-ink-3">{t('st_waiting')}</span>
                )
              )}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}

/** No PIN at the caisse — cancelling only REQUESTS the cancellation; the
 * admin approves or rejects it on their own map with the admin PIN. */
/** Who is this VIP order for? Recorded on the session for the admin —
 * the name never appears on the customer's receipt. */
function VipNameModal({
  initial,
  onClose,
  onConfirm,
  title,
  hint,
  label,
}: {
  initial: string
  onClose: () => void
  onConfirm: (name: string) => void
  title?: string
  hint?: string
  label?: string
}) {
  const [name, setName] = useState(initial)
  const t = useI18n((s) => s.t)
  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-bold">{title ?? t('vipTitle')}</h2>
      <p className="mt-1 text-[13px] text-ink-3">{hint ?? t('vipHint')}</p>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-xs font-bold text-ink-2">{label ?? t('vipName')}</span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && onConfirm(name.trim())}
          className="min-h-12 w-full rounded-xl border border-line-2 bg-surface-2 px-3.5 text-[15px] outline-none focus:border-accent"
        />
      </label>
      <div className="mt-5 flex gap-2.5">
        <Btn className="flex-1" onClick={onClose}>
          {t('cancel')}
        </Btn>
        <Btn
          variant="primary"
          className="flex-1"
          disabled={!name.trim()}
          onClick={() => onConfirm(name.trim())}
        >
          {t('confirm')}
        </Btn>
      </div>
    </Modal>
  )
}

function ReasonModal({
  title,
  label,
  onClose,
  onConfirm,
}: {
  title: string
  label: string
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  const t = useI18n((s) => s.t)
  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-bold">{title}</h2>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-xs font-bold text-ink-2">{label}</span>
        <input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="min-h-12 w-full rounded-xl border border-line-2 bg-surface-2 px-3.5 text-[15px] outline-none focus:border-accent"
        />
      </label>
      <div className="mt-5 flex gap-2.5">
        <Btn className="flex-1" onClick={onClose}>
          {t('cancel')}
        </Btn>
        <Btn variant="primary" className="flex-1" disabled={!reason.trim()} onClick={() => onConfirm(reason.trim())}>
          {t('confirm')}
        </Btn>
      </div>
    </Modal>
  )
}

/**
 * Two steps: pick the friend, then decide how the bill is treated —
 * a remise on the tab (0/20/30/40 %), or VIP, which comps the whole thing
 * under the friend's name and puts it in the VIP figures instead of on
 * their tab (nothing is owed, so it must not become a debt).
 */
function FriendPicker({
  friends,
  current,
  onClose,
  onPick,
  onVip,
  onClear,
}: {
  friends: Friend[]
  current: string | null
  onClose: () => void
  onPick: (friendId: string, discount: number) => void
  onVip: (friendName: string) => void
  onClear?: () => void
}) {
  const t = useI18n((s) => s.t)
  const [picked, setPicked] = useState<Friend | null>(null)

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-bold">{picked ? picked.name : t('friendPick')}</h2>
      <p className="mt-1 text-[13px] text-ink-3">
        {picked ? t('friendDiscountHint') : t('friendPickHint')}
      </p>

      {!picked ? (
        <>
          {friends.length === 0 ? (
            <p className="mt-4 text-center text-[13px] text-ink-3">{t('friendNone')}</p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {friends.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setPicked(f)}
                  className={`min-h-13 rounded-xl border text-[15px] font-bold transition-all active:scale-[0.98] ${
                    current === f.id
                      ? 'border-transparent bg-emerald-600 text-white'
                      : 'border-line-2 bg-surface-2'
                  }`}
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}
          <div className="mt-5 flex gap-2.5">
            <Btn className="flex-1" onClick={onClose}>
              {t('cancel')}
            </Btn>
            {onClear && (
              <Btn variant="danger" className="flex-1" onClick={onClear}>
                {t('friendRemove')}
              </Btn>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {([0, 20, 30, 40] as const).map((d) => (
              <button
                key={d}
                onClick={() => onPick(picked.id, d)}
                className="min-h-13 rounded-xl border border-line-2 bg-surface-2 text-[15px] font-bold transition-all active:scale-[0.98]"
              >
                {d === 0 ? t('noDiscount') : `-${d}%`}
              </button>
            ))}
            {/* VIP: comped under the friend's name, never a debt */}
            <button
              onClick={() => onVip(picked.name)}
              className="col-span-2 min-h-13 rounded-xl bg-stone-900 text-[15px] font-bold text-white transition-all active:scale-[0.98]"
            >
              VIP
            </button>
          </div>
          <p className="mt-2 text-[12px] text-ink-3">{t('friendVipHint')}</p>
          <div className="mt-4 flex gap-2.5">
            <Btn className="flex-1" onClick={() => setPicked(null)}>
              {t('back')}
            </Btn>
          </div>
        </>
      )}
    </Modal>
  )
}

/* ---------------- friends: settlement (mark tabs paid) ---------------- */
type Span = 'day' | 'week' | 'month' | 'custom' | 'all'

/** [from, to] YYYY-MM-DD inclusive for a span anchored on a date.
 * `anchor2` is the second bound for a custom span. */
function spanRange(span: Span, anchor: string, anchor2?: string): [string, string] {
  if (span === 'all') return ['0000-01-01', '9999-12-31']
  if (span === 'day') return [anchor, anchor]
  if (span === 'custom') {
    const b = anchor2 || anchor
    return anchor <= b ? [anchor, b] : [b, anchor]
  }
  const d = new Date(`${anchor}T12:00:00`)
  const fmt = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  if (span === 'month') {
    const first = new Date(d.getFullYear(), d.getMonth(), 1)
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    return [fmt(first), fmt(last)]
  }
  // week: Monday → Sunday containing the anchor
  const mondayOffset = (d.getDay() + 6) % 7
  const mon = new Date(d)
  mon.setDate(d.getDate() - mondayOffset)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return [fmt(mon), fmt(sun)]
}

/** Caisse "Amis" view: a card per friend with what they owe; tap to settle
 * a chosen period, which archives those bills. */
function FriendsSettle() {
  const { friends, friendDebts } = useData()
  const t = useI18n((s) => s.t)
  const [pickFriend, setPickFriend] = useState<Friend | null>(null)

  const owedBy = (fid: string) =>
    friendDebts.filter((d) => d.friend_id === fid && !d.settled).reduce((s, d) => s + d.amount, 0)

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-ink-3">{t('friendSettleHint')}</p>
      {friends.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-3">{t('friendNone')}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {friends.map((f) => {
            const owed = owedBy(f.id)
            return (
              <button
                key={f.id}
                onClick={() => setPickFriend(f)}
                className={`flex flex-col items-start gap-0.5 rounded-2xl border bg-surface px-4 py-3.5 text-left shadow-(--shadow-1) transition-all active:scale-[0.98] ${
                  owed > 0 ? 'border-emerald-300' : 'border-line'
                }`}
              >
                <span className="text-[15px] font-bold">{f.name}</span>
                <span
                  className={`tnum text-[19px] font-extrabold ${owed > 0 ? 'text-emerald-700' : 'text-ink-3'}`}
                >
                  {money(owed)}
                </span>
                <span className="text-[11px] font-semibold text-ink-3 uppercase">{t('owed')}</span>
              </button>
            )
          })}
        </div>
      )}
      {pickFriend && (
        <FriendSettleModal
          friend={pickFriend}
          debts={friendDebts.filter((d) => d.friend_id === pickFriend.id && !d.settled)}
          onClose={() => setPickFriend(null)}
        />
      )}
    </div>
  )
}

function FriendSettleModal({
  friend,
  debts,
  onClose,
}: {
  friend: Friend
  debts: FriendDebt[]
  onClose: () => void
}) {
  const user = useAuth((s) => s.user)!
  const t = useI18n((s) => s.t)
  const [span, setSpan] = useState<Span>('all')
  // Default to the SERVICE day (05:00 → 05:00), matching how a tab's
  // `incurred_on` is stamped. The old default was the UTC calendar date,
  // which after midnight pointed at a day whose tabs don't exist yet.
  const [anchor, setAnchor] = useState(todayKey)
  const [anchor2, setAnchor2] = useState(todayKey)
  const [busy, setBusy] = useState(false)
  // How the friend is actually paying their tab back — this is what lands in
  // the day's revenue (cash vs card), so the till reconciles correctly.
  const [method, setMethod] = useState<'cash' | 'card'>('cash')

  const [from, to] = spanRange(span, anchor, anchor2)
  const inRange = debts.filter((d) => d.incurred_on >= from && d.incurred_on <= to)
  const total = inRange.reduce((s, d) => s + d.amount, 0)

  // "DD/MM/YYYY" from an incurred_on key (backlog rows only carry a month).
  const fmtDebtDate = (d: FriendDebt) => {
    if (d.backlog) return d.incurred_on.slice(0, 7)
    const [y, m, dd] = d.incurred_on.split('-')
    return `${dd}/${m}/${y}`
  }
  const periodLabel =
    span === 'all'
      ? t('allFriends')
      : span === 'custom'
        ? `${from} → ${to}`
        : from === to
          ? from
          : `${from} → ${to}`

  const settle = async () => {
    if (!inRange.length || busy) return
    setBusy(true)
    await settleFriendDebts(inRange.map((d) => d.id), method)
    setBusy(false)
    onClose()
  }

  // Print the friend's statement ("l'addition") so it can be handed over —
  // records nothing, so it works before OR after marking the tab paid.
  const printStatement = async () => {
    try {
      await printFriendStatement({
        friendName: friend.name,
        periodLabel,
        lines: inRange.map((d) => ({
          date: fmtDebtDate(d),
          detail: d.note ?? '',
          amount: d.amount,
        })),
        total,
        cashier: user.name,
      })
    } catch (e) {
      console.error('[friend-statement] print failed:', e)
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-bold">
        {friend.name} — {t('settleUp')}
      </h2>
      <div className="mt-3 flex rounded-full bg-surface-2 p-1">
        {(['day', 'week', 'month', 'custom', 'all'] as Span[]).map((s) => (
          <button
            key={s}
            onClick={() => setSpan(s)}
            className={`min-h-9 flex-1 rounded-full text-[12px] font-semibold transition-all ${
              span === s ? 'bg-surface shadow-(--shadow-1)' : 'text-ink-3'
            }`}
          >
            {s === 'day'
              ? t('report_day')
              : s === 'week'
                ? t('report_week')
                : s === 'month'
                  ? t('report_month')
                  : s === 'custom'
                    ? t('customRange')
                    : t('allFriends')}
          </button>
        ))}
      </div>
      {span === 'custom' ? (
        <div className="mt-3 flex items-center gap-2">
          <input
            type="date"
            value={anchor}
            onChange={(e) => setAnchor(e.target.value)}
            className="min-h-12 flex-1 rounded-xl border border-line-2 bg-surface-2 px-3 outline-none focus:border-accent"
          />
          <span className="text-ink-3">→</span>
          <input
            type="date"
            value={anchor2}
            onChange={(e) => setAnchor2(e.target.value)}
            className="min-h-12 flex-1 rounded-xl border border-line-2 bg-surface-2 px-3 outline-none focus:border-accent"
          />
        </div>
      ) : (
        span !== 'all' && (
          <input
            type={span === 'month' ? 'month' : 'date'}
            value={span === 'month' ? anchor.slice(0, 7) : anchor}
            onChange={(e) => setAnchor(span === 'month' ? `${e.target.value}-01` : e.target.value)}
            className="mt-3 min-h-12 w-full rounded-xl border border-line-2 bg-surface-2 px-3.5 outline-none focus:border-accent"
          />
        )
      )}
      <div className="mt-4 max-h-[38vh] overflow-y-auto">
        {inRange.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-3">{t('noOwed')}</p>
        ) : (
          inRange.map((d) => (
            <div key={d.id} className="flex justify-between gap-3 border-b border-line py-2 text-[13px]">
              <span className="min-w-0 truncate">
                {d.backlog ? d.incurred_on.slice(0, 7) : d.incurred_on}
                {d.note ? ` · ${d.note}` : ''}
              </span>
              <span className="tnum shrink-0 font-semibold">{money(d.amount)}</span>
            </div>
          ))
        )}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs font-bold text-ink-3 uppercase">{t('totalOwed')}</span>
        <span className="tnum text-xl font-extrabold">{money(total)}</span>
      </div>

      {/* how they're paying it back — the method that goes into revenue */}
      <div className="mt-3">
        <span className="mb-1.5 block text-xs font-bold text-ink-3 uppercase">{t('payMethod')}</span>
        <div className="flex gap-2">
          <button
            onClick={() => setMethod('cash')}
            className={`inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border text-[14px] font-bold transition-all ${
              method === 'cash' ? 'border-transparent bg-accent text-white' : 'border-line-2 bg-surface-2'
            }`}
          >
            <Banknote size={16} /> {t('cash')}
          </button>
          <button
            onClick={() => setMethod('card')}
            className={`inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border text-[14px] font-bold transition-all ${
              method === 'card' ? 'border-transparent bg-accent text-white' : 'border-line-2 bg-surface-2'
            }`}
          >
            <CreditCard size={16} /> {t('card')}
          </button>
        </div>
      </div>

      {/* print l'addition — hand it to the friend so they see what they owe.
          Available whether or not the tab is being settled right now. */}
      <div className="mt-3">
        <Btn className="w-full" disabled={inRange.length === 0} onClick={printStatement}>
          <span className="inline-flex items-center gap-1.5">
            <Printer size={16} /> {t('printStatement')}
          </span>
        </Btn>
      </div>

      <div className="mt-3 flex gap-2.5">
        <Btn className="flex-1" onClick={onClose}>
          {t('cancel')}
        </Btn>
        <Btn variant="success" className="flex-1" disabled={busy || inRange.length === 0} onClick={settle}>
          {t('markPaid')}
        </Btn>
      </div>
    </Modal>
  )
}
