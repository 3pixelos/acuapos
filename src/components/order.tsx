import { useEffect, useRef, useState } from 'react'
import { Ban, ChefHat, ChevronLeft, Eye, Minus, Plus, Trash2, Unlink } from 'lucide-react'
import { Btn, Drawer, Modal, StatusChip } from './ui'
import { useNow } from './FloorMap'
import { useAuth } from '../state/auth'
import { useData } from '../state/data'
import {
  addCustomItem,
  addIncludedDrink,
  addItem,
  clearEditing,
  markEditing,
  markServed,
  removeCartItem,
  sendToKitchen,
  setNote,
  setQty,
  splitMerge,
  voidSentItem,
} from '../state/actions'
import { clock, money } from '../lib/format'
import { useI18n } from '../lib/i18n'
import type { MenuCategory, MenuItem as MenuItemT, MenuMain, OrderItem, TableSession } from '../lib/types'
import {
  autoIncludedDrinkFor,
  catName,
  DRINK_INCLUDED_CATEGORIES,
  NO_INCLUDED_DRINK_ITEMS,
  INCLUDED_DRINK_CATEGORY,
  INCLUDED_DRINKS_COLD,
  INCLUDED_DRINKS_HOT,
  isAvailable,
  labelsFor,
  MENU_MAINS,
  visualStatus,
} from '../lib/types'

/* ---------------- customizable items ---------------- */
/** 1 œuf 14, 2 œufs 26, then +14 per extra egg (3 -> 40, 4 -> 54). */
const eggPrice = (n: number) => (n <= 1 ? 14 : 26 + 14 * (n - 2))
const EGG_PREPS = ['Au plat', 'Brouillés', 'Omelette', 'À la coque']

/** Menu rows that are one item with selectable variants — the waiter picks
 * which one. Explicit list: slash-names elsewhere (Adana Kebab / Tavuk
 * Adana Kebab…) are separate dishes, not variants. */
const VARIANT_ITEMS: ReadonlyArray<{ match: RegExp; strip: RegExp; options: string[] }> = [
  {
    match: /frappuccino.*noisette.*caramel.*vanille/i,
    strip: /\s*noisette\s*\/\s*caramel\s*\/\s*vanille\s*$/i,
    options: ['Noisette', 'Caramel', 'Vanille'],
  },
]
const variantOptionsOf = (name: string) =>
  VARIANT_ITEMS.find((v) => v.match.test(name))?.options ?? null
const variantBaseOf = (name: string) => {
  const v = VARIANT_ITEMS.find((x) => x.match.test(name))
  return v ? name.replace(v.strip, '').trim() : name
}

/* Included-drink rows are stored as their own 0-priced order_items (the
 * bar ticket needs them) named "<breakfast> — <drink> inclus". The waiter
 * UI hides those rows and shows the drink under its breakfast row. */
const isDrinkLine = (i: OrderItem) => i.category === INCLUDED_DRINK_CATEGORY
const drinksOf = (parent: OrderItem, list: OrderItem[]) =>
  list.filter((d) => isDrinkLine(d) && d.name.startsWith(`${parent.name} — `))
const drinkLabel = (parent: OrderItem, d: OrderItem) =>
  `${d.qty}× ${d.name.slice(`${parent.name} — `.length)}`

/* Order-taking UI shared by the waiter app and the caisse (the caisse can
 * seat tables and send orders too, e.g. takeaway or when short-staffed). */

/* ---------------- seat covers modal ---------------- */
export function SeatModal({
  labels,
  maxCovers,
  onClose,
  onSeat,
}: {
  labels: string[]
  maxCovers: number
  onClose: () => void
  onSeat: (covers: number) => void
}) {
  const [covers, setCovers] = useState<number | null>(null)
  const [custom, setCustom] = useState('')
  const t = useI18n((s) => s.t)
  // Seating asks the database whether the table is already taken, so this
  // button is no longer instant. Without a guard an impatient second tap
  // started a rival request and the table ended up with two open sessions —
  // the waiter's order went into one and the floor showed the other.
  const [seating, setSeating] = useState(false)
  const seatingRef = useRef(false)

  // Quick numbers are a shortcut, not a hard cap — the custom box below
  // always accepts any number, even beyond the table's usual capacity
  // (extra chairs happen).
  const cap = Math.max(1, maxCovers)
  const quick = [1, 2, 3, 4, 5, 6, 8, 10].filter((n) => n <= Math.min(cap, 10))

  const customNum = custom.trim() ? Math.max(1, parseInt(custom, 10) || 0) : null
  const effective = customNum ?? covers

  const confirm = () => {
    if (seatingRef.current || !effective) return // block the repeat tap
    seatingRef.current = true
    setSeating(true)
    onSeat(effective)
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-xl font-bold tracking-tight">{labels.join(' + ')}</h2>
      <p className="mt-1 text-[13px] text-ink-3">
        {t('howMany')} <span className="text-ink-3">· {cap} {t('maxGuests')}</span>
      </p>
      <div className="my-5 grid grid-cols-4 gap-2.5">
        {quick.map((n) => (
          <button
            key={n}
            onClick={() => {
              setCovers(n)
              setCustom('')
            }}
            className={`h-13 rounded-xl border text-lg font-bold transition-all duration-150 ${
              effective === n && !customNum
                ? 'border-transparent bg-accent text-white'
                : 'border-line-2 bg-surface-2'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <label className="mb-5 flex items-center gap-2.5">
        <span className="text-[13px] font-semibold text-ink-2">{t('otherNumber')}</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value)
            setCovers(null)
          }}
          placeholder="1+"
          className="h-11 w-24 rounded-xl border border-line-2 bg-surface-2 px-3 text-center text-[15px] font-bold outline-none focus:border-accent"
        />
      </label>
      <Btn variant="primary" className="w-full" disabled={!effective || seating} onClick={confirm}>
        {seating ? t('seating') : t('seatTable')}
      </Btn>
    </Modal>
  )
}

/* ---------------- order drawer ---------------- */
/**
 * Read-only peek at a colleague's table. A waiter can open ANY table to SEE
 * what's on it, but only the waiter who claimed it (or the caisse) may change
 * anything — so this shows the order and gives no way to edit it. Stops people
 * adding to, or deleting articles off, tables that aren't theirs.
 */
export function ViewOnlyDrawer({ session, onClose }: { session: TableSession; onClose: () => void }) {
  const { items, tables, staff } = useData()
  const t = useI18n((s) => s.t)
  const now = useNow()
  const list = items.filter((i) => i.session_id === session.id && !i.voided)
  const total = list.reduce((s, i) => s + i.price * i.qty, 0)
  const tableRef = labelsFor(tables, session.table_ids)
  const owner = staff.find((s) => s.id === session.waiter_id)?.name ?? '—'
  return (
    <Drawer
      title={`Table ${tableRef}`}
      badge={<StatusChip status={visualStatus(session, now)} />}
      subtitle={`${session.covers} ${t('covers')}`}
      onClose={onClose}
    >
      <div className="mb-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[13px] font-semibold text-amber-800">
        <Eye size={15} /> {t('viewOnlyBy')} {owner}
      </div>
      {list.length === 0 && <p className="py-8 text-center text-sm text-ink-3">{t('noItems')}</p>}
      {list.map((it) => (
        <div key={it.id} className="flex items-center justify-between gap-3 border-b border-line py-2.5">
          <span className="truncate text-[14px] font-medium">
            {it.qty}× {it.name}
          </span>
          <span className="tnum text-[14px] font-semibold">{money(it.price * it.qty)}</span>
        </div>
      ))}
      {list.length > 0 && (
        <div className="mt-4 flex items-center justify-between text-[15px] font-extrabold">
          <span>{t('total')}</span>
          <span className="tnum">{money(total)}</span>
        </div>
      )}
    </Drawer>
  )
}

export function OrderDrawer({
  session,
  onClose,
  onServed,
}: {
  session: TableSession
  onClose: () => void
  /** Caisse passes this to jump straight to the checkout screen the
   * moment the table is marked served. */
  onServed?: () => void
}) {
  const user = useAuth((s) => s.user)!
  const { categories, menu, items, tables, stock } = useData()
  const { lang, t } = useI18n()
  const now = useNow()

  // "Someone is ordering here" lock. While this order screen is open we
  // heartbeat the session so a colleague can't take the table over and kick
  // us out mid-order. Cleared on close; the lock auto-expires shortly after
  // if the device just drops off (see editingByOther / EDIT_LOCK_MS).
  useEffect(() => {
    markEditing(session.id, user.id)
    const id = setInterval(() => markEditing(session.id, user.id), 7000)
    return () => {
      clearInterval(id)
      clearEditing(session.id, user.id)
    }
  }, [session.id, user.id])
  // The session's own location decides stock (not the user's) so an admin
  // adding to a table sees that table's location's stock.
  const stockBranch = session.branch ?? user.branch
  const outOfStock = (id: string) => !isAvailable(stock, id, stockBranch)
  // Two-level menu: pick a main category first (nothing else on screen),
  // then its subcategories + items. On a DB that predates the mains
  // migration every category has main = '' and the flat chip list shows.
  const mains = MENU_MAINS.filter((m) => categories.some((c) => c.main === m))
  const [mainSel, setMainSel] = useState<MenuMain | null>(null)
  const [catId, setCatId] = useState(mains.length ? '' : (categories[0]?.id ?? ''))
  const [voidTarget, setVoidTarget] = useState<OrderItem | null>(null)
  const [splitAsk, setSplitAsk] = useState(false)
  // In-flight guard for "send to kitchen" — same fix as the caisse pay
  // buttons. On flaky Wi-Fi the send hangs; without this the waiter taps
  // again (or re-types the order) and the kitchen gets duplicate tickets.
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  // Formulas / Turkish Breakfast items come with a free drink — adding one
  // first asks which drink to bring (À La Carte doesn't). The same modal
  // also re-opens in EDIT mode when the waiter taps the breakfast cart row
  // to change its drink(s).
  const [drinkAsk, setDrinkAsk] = useState<
    | { name: string; add: { item: MenuItemT; cat: MenuCategory }; edit?: undefined }
    | { name: string; add?: undefined; edit: { parent: OrderItem; old: OrderItem[] } }
    | null
  >(null)
  // Drinks picked so far, per group: every formula includes ONE cold and
  // ONE hot drink — the 2-person Kahvalti includes TWO of each. The same
  // option can be picked twice (2 oranges + 2 teas).
  const [drinkSel, setDrinkSel] = useState<{ cold: string[]; hot: string[] }>({ cold: [], hot: [] })
  const perGroup = drinkAsk && /kahvalti/i.test(drinkAsk.name) && /2\s*p/i.test(drinkAsk.name) ? 2 : 1
  const resetDrinkSel = () => setDrinkSel({ cold: [], hot: [] })
  /** Tap an option: add while the group has room; when full, tapping a
   * selected option removes one of it, tapping another swaps the oldest. */
  const tapDrink = (group: 'cold' | 'hot', fr: string) =>
    setDrinkSel((s) => {
      const sel = s[group]
      let next: string[]
      if (sel.length < perGroup) next = [...sel, fr]
      else if (sel.includes(fr)) {
        next = [...sel]
        next.splice(next.indexOf(fr), 1)
      } else next = [...sel.slice(1), fr]
      return { ...s, [group]: next }
    })
  // customizable-item pickers (eggs count+prep, name variants)
  const [eggAsk, setEggAsk] = useState<{ item: MenuItemT; cat?: MenuCategory } | null>(null)
  const [eggCount, setEggCount] = useState(1)
  const [eggPrep, setEggPrep] = useState('')
  const [variantAsk, setVariantAsk] = useState<{
    item: MenuItemT
    cat?: MenuCategory
    options: string[]
  } | null>(null)

  const subcats = mainSel ? categories.filter((c) => c.main === mainSel) : categories

  // toast near the thumb — "item added" (green) or an error (red)
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const toastNow = (text: string) => {
    setToast({ text })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 1400)
  }
  const toastError = (text: string) => {
    setToast({ text, error: true })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 1600)
  }

  const mine = items.filter((i) => i.session_id === session.id && !i.voided)
  const cart = mine.filter((i) => i.ticket_no === null)
  const sent = mine.filter((i) => i.ticket_no !== null)
  // drink lines ride along with their breakfast row, never shown alone
  const cartMain = cart.filter((i) => !isDrinkLine(i))
  const sentMain = sent.filter((i) => !isDrinkLine(i))
  const total = mine.reduce((s, i) => s + i.price * i.qty, 0)
  const tableRef = labelsFor(tables, session.table_ids)
  const status = visualStatus(session, now)

  // Printing happens on the kitchen print station (silent, no dialog on the
  // waiter's device) — see /kitchen.
  const send = async () => {
    if (sendingRef.current || cart.length === 0) return // block the repeat tap
    sendingRef.current = true
    setSending(true)
    try {
      const ok = await sendToKitchen(session, cart)
      // On failure the cart is kept intact — tell the waiter to RETRY the
      // same order (one more tap) rather than re-enter it, which is what
      // created the duplicate tickets.
      if (!ok) window.alert(t('sendFailed'))
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  return (
    <Drawer
      title={`Table ${tableRef}`}
      badge={<StatusChip status={status} />}
      subtitle={`${session.covers} ${t('covers')} · ${t('openedAt')} ${clock(session.seated_at)}`}
      onClose={onClose}
      footer={
        <div>
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-3">
              {t('totalTable')}
              {cart.length > 0 && ` · ${cart.length} ${t('pendingSend')}`}
            </span>
            <span className="tnum text-xl font-extrabold">{money(total)}</span>
          </div>
          <div className="flex gap-2.5">
            {(session.status === 'preparing' || session.status === 'served') && (
              <Btn
                variant="success"
                className="flex-1"
                disabled={session.status === 'served'}
                onClick={() => {
                  void markServed(session)
                  onServed?.()
                }}
              >
                {session.status === 'served' ? `✓ ${t('served')}` : t('markServed')}
              </Btn>
            )}
            <Btn variant="primary" className="flex-1" disabled={cart.length === 0 || sending} onClick={send}>
              <span className="inline-flex items-center gap-1.5">
                <ChefHat size={16} />
                {sending ? t('sending') : session.ticket_seq === 0 ? t('sendKitchen') : t('sendMore')}
              </span>
            </Btn>
          </div>
        </div>
      }
    >
      {/* joined tables — undo the merge (each table gets its own items back) */}
      {session.table_ids.length > 1 && (
        <button
          onClick={() => setSplitAsk(true)}
          className="mb-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-line-2 bg-surface-2 py-2.5 text-[13px] font-bold text-ink-2"
        >
          <Unlink size={15} /> {t('separateTables')}
        </button>
      )}

      {/* level 1 — main categories only, nothing else on screen */}
      {mains.length > 0 && !mainSel && (
        <div className="grid grid-cols-1 gap-2.5 py-2 sm:grid-cols-2">
          {mains.map((m) => (
            <button
              key={m}
              onClick={() => {
                setMainSel(m)
                setCatId(categories.find((c) => c.main === m)?.id ?? '')
              }}
              className="min-h-20 rounded-2xl border border-line bg-surface-2 text-[16px] font-bold shadow-(--shadow-1) transition-all active:scale-[0.98]"
            >
              {t(`main_${m}`)}
            </button>
          ))}
        </div>
      )}

      {/* level 2 — subcategories + items. The back button sits OUTSIDE the
          scrollable chip row, so leaving a main category never requires
          scrolling back through all its subcategories. */}
      {(mains.length === 0 || mainSel) && (
        <div className="mb-2 flex items-center gap-2">
          {mainSel && (
            <button
              onClick={() => {
                setMainSel(null)
                setCatId('')
              }}
              aria-label={t('back')}
              className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full border border-accent/40 bg-surface px-3 text-[13px] font-bold text-accent"
            >
              <ChevronLeft size={16} /> {t(`main_${mainSel}`)}
            </button>
          )}
          <div className="-mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 pb-1">
            {subcats.map((c) => (
              <button
                key={c.id}
                onClick={() => setCatId(c.id)}
                className={`min-h-10 shrink-0 rounded-full border px-4 text-[13px] font-semibold transition-all duration-150 ${
                  catId === c.id
                    ? 'border-accent bg-accent text-white'
                    : 'border-line bg-surface text-ink-2'
                }`}
              >
                {catName(c, lang)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* menu items — name + price only, descriptions stay off the tablet */}
      <div>
        {menu
          .filter((m) => m.category_id === catId)
          .map((m) => {
            const inCart = cart.filter((i) => i.menu_item_id === m.id).reduce((s, i) => s + i.qty, 0)
            const out = outOfStock(m.id)
            return (
              <div key={m.id} className="flex items-center justify-between gap-3 border-b border-line py-3">
                <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                  <span
                    className={`min-w-0 truncate text-[14.5px] font-semibold ${out ? 'text-danger' : ''}`}
                  >
                    {m.name}
                    {out && (
                      <span className="ml-2 rounded-full bg-red-100 px-2 py-px text-[10px] font-bold tracking-wide text-danger uppercase">
                        {t('outOfStock')}
                      </span>
                    )}
                  </span>
                  <span
                    className={`tnum shrink-0 text-[14px] font-bold ${out ? 'text-danger/60' : 'text-ink-2'}`}
                  >
                    {money(m.price)}
                  </span>
                </div>
                {inCart > 0 && !out && (
                  <span className="tnum grid size-6 shrink-0 place-items-center rounded-full bg-accent/10 text-[12px] font-extrabold text-accent">
                    {inCart}
                  </span>
                )}
                <button
                  onClick={() => {
                    if (out) {
                      toastError(`${m.name} — ${t('outOfStockToast')}`)
                      return
                    }
                    const cat = categories.find((c) => c.id === m.category_id)
                    // customizable items open their own picker first
                    if (/^oeufs$/i.test(m.name.trim())) {
                      setEggAsk({ item: m, cat })
                      return
                    }
                    const variants = variantOptionsOf(m.name)
                    if (variants) {
                      setVariantAsk({ item: m, cat, options: variants })
                      return
                    }
                    const noDrink = NO_INCLUDED_DRINK_ITEMS.some(
                      (n) => n.toLowerCase() === m.name.trim().toLowerCase(),
                    )
                    if (cat && !noDrink && DRINK_INCLUDED_CATEGORIES.includes(cat.name_en)) {
                      setDrinkAsk({ name: m.name, add: { item: m, cat } })
                      return
                    }
                    // Breakfasts whose drink is fixed get it added for them —
                    // no picker, because there is nothing to choose.
                    const auto = autoIncludedDrinkFor(m.name)
                    void (async () => {
                      await addItem(session.id, m, cat ? cat.name_fr : '')
                      for (let k = 0; auto && k < auto.qty; k++) {
                        await addIncludedDrink(session.id, auto.drinkFr, m.name)
                      }
                    })()
                    toastNow(m.name)
                  }}
                  aria-label={`+ ${m.name}`}
                  className={`grid size-11 shrink-0 place-items-center rounded-full text-white transition-all active:scale-95 ${
                    out ? 'cursor-not-allowed bg-line-2 text-ink-3' : 'bg-accent'
                  }`}
                >
                  {out ? <Ban size={18} /> : <Plus size={20} />}
                </button>
              </div>
            )
          })}
      </div>

      {/* order so far — drink lines fold into their breakfast row */}
      {mine.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-1 text-[15px] font-bold">{t('order')}</h3>
          {sentMain.map((i) => (
            <SentRow
              key={i.id}
              item={i}
              drinks={drinksOf(i, sent)}
              canVoid={user.role !== 'waiter'}
              onVoid={() => setVoidTarget(i)}
            />
          ))}
          {cartMain.map((i) => (
            <CartRow
              key={i.id}
              item={i}
              drinks={drinksOf(i, cart)}
              onEditDrinks={(drinks) => {
                resetDrinkSel()
                setDrinkAsk({ name: i.name, edit: { parent: i, old: drinks } })
              }}
            />
          ))}
        </div>
      )}

      {/* toast — green "added" or red error */}
      {toast && (
        <div
          className={`anim-fade fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-[13px] font-bold text-white shadow-(--shadow-2) ${
            toast.error ? 'bg-danger' : 'bg-stone-900/90'
          }`}
        >
          {toast.error ? `⛔ ${toast.text}` : `✓ ${toast.text} — ${t('addedToCart')}`}
        </div>
      )}

      {drinkAsk && (
        <Modal
          onClose={() => {
            setDrinkAsk(null)
            resetDrinkSel()
          }}
        >
          <h2 className="text-lg font-bold">{drinkAsk.name}</h2>
          <p className="mt-1 text-[13px] text-ink-3">
            {perGroup === 2 ? t('chooseDrinksColdHot2') : t('chooseDrinksColdHot')}
          </p>
          <div className="max-h-[60vh] overflow-y-auto">
            {(
              [
                ['cold', t('coldDrink'), INCLUDED_DRINKS_COLD],
                ['hot', t('hotDrink'), INCLUDED_DRINKS_HOT],
              ] as const
            ).map(([group, label, options]) => (
              <div key={group} className="mt-4">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-bold tracking-wide text-ink-3 uppercase">{label}</span>
                  <span
                    className={`text-[12px] font-extrabold ${
                      drinkSel[group].length === perGroup ? 'text-st-served' : 'text-accent'
                    }`}
                  >
                    {drinkSel[group].length}/{perGroup}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {options.map(([fr, en]) => {
                    const picked = drinkSel[group].filter((d) => d === fr).length
                    return (
                      <button
                        key={fr}
                        onClick={() => tapDrink(group, fr)}
                        className={`relative min-h-13 rounded-xl border px-2 text-[13.5px] font-semibold transition-all active:scale-[0.98] ${
                          picked > 0
                            ? 'border-transparent bg-accent text-white'
                            : 'border-line-2 bg-surface-2'
                        }`}
                      >
                        {/* included drinks carry only [fr, en] labels; a
                            Spanish till reads the English one */}
                        {lang === 'fr' ? fr : en}
                        {picked > 0 && (
                          <span className="tnum absolute -top-1.5 -right-1.5 grid size-6 place-items-center rounded-full bg-stone-900 text-[12px] font-extrabold text-white shadow-(--shadow-1)">
                            {picked}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <Btn
            variant="primary"
            className="mt-4 w-full"
            disabled={drinkSel.cold.length !== perGroup || drinkSel.hot.length !== perGroup}
            onClick={() => {
              const chosen = [...drinkSel.cold, ...drinkSel.hot]
              if (drinkAsk.add) {
                void addItem(session.id, drinkAsk.add.item, drinkAsk.add.cat.name_fr)
              }
              // sequential: same drink twice must merge, not race — and in
              // edit mode the old drink lines go first
              const oldDrinks = drinkAsk.edit?.old ?? []
              void (async () => {
                for (const d of oldDrinks) await removeCartItem(d.id)
                for (const d of chosen) await addIncludedDrink(session.id, d, drinkAsk.name)
              })()
              toastNow(drinkAsk.name)
              setDrinkAsk(null)
              resetDrinkSel()
            }}
          >
            {t('confirm')}
          </Btn>
        </Modal>
      )}

      {/* Oeufs picker: how many + how prepared, price computed from count */}
      {eggAsk && (
        <Modal
          onClose={() => {
            setEggAsk(null)
            setEggCount(1)
            setEggPrep('')
          }}
        >
          <h2 className="text-lg font-bold">{eggAsk.item.name}</h2>
          <div className="mt-4">
            <span className="mb-1.5 block text-xs font-bold tracking-wide text-ink-3 uppercase">
              {t('eggsCount')}
            </span>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => setEggCount(n)}
                  className={`flex h-14 flex-col items-center justify-center rounded-xl border font-bold transition-all ${
                    eggCount === n ? 'border-transparent bg-accent text-white' : 'border-line-2 bg-surface-2'
                  }`}
                >
                  <span className="text-[16px]">{n}</span>
                  <span className="tnum text-[11px] opacity-80">{eggPrice(n)} €</span>
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <span className="mb-1.5 block text-xs font-bold tracking-wide text-ink-3 uppercase">
              {t('preparation')}
            </span>
            <div className="grid grid-cols-2 gap-2">
              {EGG_PREPS.map((prep) => (
                <button
                  key={prep}
                  onClick={() => setEggPrep(prep)}
                  className={`min-h-12 rounded-xl border text-[13.5px] font-semibold transition-all ${
                    eggPrep === prep ? 'border-transparent bg-accent text-white' : 'border-line-2 bg-surface-2'
                  }`}
                >
                  {prep}
                </button>
              ))}
            </div>
          </div>
          <Btn
            variant="primary"
            className="mt-4 w-full"
            disabled={!eggPrep}
            onClick={() => {
              const name = `Oeufs ×${eggCount} — ${eggPrep}`
              void addCustomItem(session.id, eggAsk.item, eggAsk.cat?.name_fr ?? '', name, eggPrice(eggCount))
              toastNow(name)
              setEggAsk(null)
              setEggCount(1)
              setEggPrep('')
            }}
          >
            {t('confirm')} · {eggPrice(eggCount)} €
          </Btn>
        </Modal>
      )}

      {/* variant picker (e.g. Frappuccino Noisette / Caramel / Vanille) */}
      {variantAsk && (
        <Modal onClose={() => setVariantAsk(null)}>
          <h2 className="text-lg font-bold">{variantAsk.item.name}</h2>
          <p className="mt-1 text-[13px] text-ink-3">{t('chooseOption')}</p>
          <div className="mt-4 grid gap-2">
            {variantAsk.options.map((opt) => (
              <button
                key={opt}
                onClick={() => {
                  const name = `${variantBaseOf(variantAsk.item.name)} ${opt}`
                  void addCustomItem(
                    session.id,
                    variantAsk.item,
                    variantAsk.cat?.name_fr ?? '',
                    name,
                    variantAsk.item.price,
                  )
                  toastNow(name)
                  setVariantAsk(null)
                }}
                className="min-h-13 rounded-xl border border-line-2 bg-surface-2 text-[14.5px] font-semibold transition-all active:scale-[0.98]"
              >
                {opt}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {voidTarget && (
        <ReasonModal
          title={`${t('voidItem')} — ${voidTarget.name}`}
          label={t('voidReason')}
          onClose={() => setVoidTarget(null)}
          onConfirm={async (reason) => {
            await voidSentItem(voidTarget, user.id, reason)
            setVoidTarget(null)
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

function CartRow({
  item,
  drinks,
  onEditDrinks,
}: {
  item: OrderItem
  drinks: OrderItem[]
  onEditDrinks: (drinks: OrderItem[]) => void
}) {
  const t = useI18n((s) => s.t)
  const removeWithDrinks = () => {
    // the breakfast leaves with its included drink lines
    void removeCartItem(item.id)
    for (const d of drinks) void removeCartItem(d.id)
  }
  return (
    <div className="border-b border-dashed border-line py-2.5">
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold">{item.name}</span>
            <span className="rounded-full bg-amber-100 px-2 py-px text-[10px] font-bold tracking-wide text-amber-700 uppercase">
              {t('cart')}
            </span>
          </div>
          {drinks.length > 0 && (
            <div className="mt-1 flex flex-col gap-1">
              {drinks.map((d) => (
                // each included drink gets its own small note box (e.g. "sans
                // sucre") — the note prints on the bar ticket with the drink
                <div key={d.id} className="flex items-center gap-1.5">
                  <span className="shrink-0 text-xs font-semibold text-ink-2">
                    » {drinkLabel(item, d)}
                  </span>
                  <input
                    defaultValue={d.note}
                    placeholder={t('note')}
                    onBlur={(e) => e.target.value !== d.note && setNote(d.id, e.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-[11px] outline-none focus:border-accent"
                  />
                </div>
              ))}
              {/* change the included drink choice */}
              <button
                onClick={() => onEditDrinks(drinks)}
                className="self-start text-[11px] font-semibold text-accent underline-offset-2 hover:underline"
              >
                {t('changeDrink')}
              </button>
            </div>
          )}
          <div className="tnum mt-0.5 text-xs text-ink-3">
            {money(item.price)} × {item.qty} = {money(item.price * item.qty)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <QtyBtn onClick={() => setQty(item.id, item.qty - 1)}>
            <Minus size={14} />
          </QtyBtn>
          <span className="tnum min-w-5 text-center text-sm font-bold">{item.qty}</span>
          <QtyBtn onClick={() => setQty(item.id, item.qty + 1)}>
            <Plus size={14} />
          </QtyBtn>
          <button
            onClick={removeWithDrinks}
            aria-label={t('voidItem')}
            className="grid size-9 place-items-center rounded-lg text-danger"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <input
        defaultValue={item.note}
        placeholder={t('note')}
        onBlur={(e) => e.target.value !== item.note && setNote(item.id, e.target.value)}
        className="mt-2 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px] outline-none focus:border-accent"
      />
    </div>
  )
}

function SentRow({
  item,
  drinks,
  canVoid,
  onVoid,
}: {
  item: OrderItem
  drinks: OrderItem[]
  canVoid: boolean
  onVoid: () => void
}) {
  const t = useI18n((s) => s.t)
  return (
    <div className="flex items-start gap-2.5 border-b border-dashed border-line py-2.5 opacity-90">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold">{item.name}</span>
          <span className="rounded-full bg-blue-100 px-2 py-px text-[10px] font-bold tracking-wide text-blue-700 uppercase">
            {t('sent')} #{item.ticket_no}
          </span>
        </div>
        {drinks.length > 0 && (
          <div className="mt-0.5 text-xs font-semibold text-ink-2">
            {drinks.map((d) => (
              <div key={d.id}>
                » {drinkLabel(item, d)}
                {d.note ? ` — ${d.note}` : ''}
              </div>
            ))}
          </div>
        )}
        <div className="tnum mt-0.5 text-xs text-ink-3">
          {money(item.price)} × {item.qty} = {money(item.price * item.qty)}
        </div>
        {item.note && <div className="mt-0.5 text-xs text-ink-3">» {item.note}</div>}
      </div>
      {/* once it's in the kitchen, only the caisse can void it */}
      {canVoid && (
        <button onClick={onVoid} className="text-xs font-bold text-danger underline-offset-2 hover:underline">
          {t('voidItem')}
        </button>
      )}
    </div>
  )
}

function QtyBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="grid size-9 place-items-center rounded-lg border border-line-2 bg-surface font-bold"
    >
      {children}
    </button>
  )
}

export function ReasonModal({
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
