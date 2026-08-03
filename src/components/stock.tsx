import { useEffect, useState } from 'react'
import { Ban, CheckCircle2, ChevronLeft } from 'lucide-react'
import { useAuth } from '../state/auth'
import { useData } from '../state/data'
import { setItemAvailability, setItemPrice } from '../state/actions'
import { money } from '../lib/format'
import { useI18n } from '../lib/i18n'
import type { Branch, MenuItem as MenuItemT, MenuMain } from '../lib/types'
import { catName, isAvailable, MENU_MAINS } from '../lib/types'

/**
 * Availability ("rupture de stock") manager, shared by the caisse and the
 * admin. Same two-level navigation as the waiter's menu: main categories,
 * then subcategory chips + item rows — each row with an on/off switch.
 * Unavailable items stay visible to waiters (red, tagged) but can't be
 * added to an order.
 */
/**
 * @param branch Which branch's stock is being edited. The admin passes the
 *   branch selected in the header switcher; the caisse doesn't pass one at
 *   all and is pinned to its own branch — a cashier can never flip the
 *   other restaurant's stock.
 */
export function AvailabilityManager({ branch }: { branch?: Branch }) {
  const user = useAuth((s) => s.user)!
  const { categories, menu, stock } = useData()
  // prices are the owner's call — the caisse can only flip availability
  const canEditPrices = user.role === 'admin'
  // Single-location: everything resolves to the one location.
  const target: Branch = user.role === 'admin' ? (branch ?? 'main') : user.branch
  const { lang, t } = useI18n()
  const mains = MENU_MAINS.filter((m) => categories.some((c) => c.main === m))
  const [mainSel, setMainSel] = useState<MenuMain | null>(null)
  const [catId, setCatId] = useState('')
  const subcats = mainSel ? categories.filter((c) => c.main === mainSel) : categories

  const avail = (id: string) => isAvailable(stock, id, target)
  // count of unavailable items per main / subcategory, for at-a-glance badges
  const outIn = (catIds: string[]) =>
    menu.filter((m) => catIds.includes(m.category_id) && !avail(m.id)).length

  return (
    <div>
      {/* level 1 — main categories */}
      {mains.length > 0 && !mainSel && (
        <div className="grid grid-cols-1 gap-2.5 py-2 sm:grid-cols-2">
          {mains.map((m) => {
            const catIds = categories.filter((c) => c.main === m).map((c) => c.id)
            const out = outIn(catIds)
            return (
              <button
                key={m}
                onClick={() => {
                  setMainSel(m)
                  setCatId(categories.find((c) => c.main === m)?.id ?? '')
                }}
                className="relative min-h-20 rounded-2xl border border-line bg-surface-2 text-[16px] font-bold shadow-(--shadow-1) transition-all active:scale-[0.98]"
              >
                {t(`main_${m}`)}
                {out > 0 && (
                  <span className="absolute top-2 right-2 rounded-full bg-red-100 px-2 py-px text-[11px] font-bold text-danger">
                    {out} {t('outOfStockShort')}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* level 2 — subcategory chips + item switches */}
      {(mains.length === 0 || mainSel) && (
        <>
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
                  {outIn([c.id]) > 0 && <span className="ml-1.5 font-bold text-red-300">•</span>}
                </button>
              ))}
            </div>
          </div>

          <div>
            {menu
              .filter((m) => m.category_id === catId)
              .map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-3 border-b border-line py-3"
                >
                  <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                    <span
                      className={`min-w-0 truncate text-[14.5px] font-semibold ${
                        avail(m.id) ? '' : 'text-danger'
                      }`}
                    >
                      {m.name}
                    </span>
                    {canEditPrices ? (
                      <PriceInput item={m} staffId={user.id} />
                    ) : (
                      <span className="tnum shrink-0 text-[14px] font-bold text-ink-2">
                        {money(m.price)}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => void setItemAvailability(m, !avail(m.id), user.id, target)}
                    className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-bold transition-all active:scale-[0.97] ${
                      avail(m.id)
                        ? 'bg-st-served-soft text-st-served'
                        : 'bg-red-100 text-danger'
                    }`}
                  >
                    {avail(m.id) ? <CheckCircle2 size={15} /> : <Ban size={15} />}
                    {avail(m.id) ? t('available') : t('outOfStock')}
                  </button>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  )
}

/** Inline price editor: commits on blur or Enter, reverts on Escape.
 * Editing the menu price never touches past orders — order_items keep the
 * price they were charged at. */
function PriceInput({ item, staffId }: { item: MenuItemT; staffId: string }) {
  const [draft, setDraft] = useState(String(item.price))
  const [editing, setEditing] = useState(false)
  const [failed, setFailed] = useState(false)
  const t = useI18n((s) => s.t)

  // pick up outside changes (another device) while not being edited
  useEffect(() => {
    if (!editing) setDraft(String(item.price))
  }, [item.price, editing])

  const commit = async () => {
    setEditing(false)
    setFailed(false)
    // Euro prices carry cents (9,95) — rounding to a whole unit here, as the
    // dirham build did, would silently turn 9,95 into 10.
    const n = Math.max(0, Math.round(Number(draft.replace(',', '.')) * 100) / 100)
    if (!Number.isFinite(n) || n === item.price) return setDraft(String(item.price))
    // Say so when it doesn't stick. Showing the new number and reverting on
    // the next refresh is the one behaviour that wastes someone's evening.
    if (!(await setItemPrice(item, n, staffId))) {
      setDraft(String(item.price))
      setFailed(true)
    }
  }

  return (
    <span className="inline-flex shrink-0 flex-col items-end gap-0.5">
      <span className="inline-flex items-center gap-1">
      <input
        value={draft}
        inputMode="decimal"
        onFocus={() => setEditing(true)}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d.,]/g, ''))}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            setDraft(String(item.price))
            setEditing(false)
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        aria-label={`Prix ${item.name}`}
        className={`tnum h-9 w-16 rounded-lg border bg-surface-2 px-2 text-right text-[14px] font-bold outline-none focus:border-accent ${
          failed ? 'border-danger' : 'border-line-2'
        }`}
      />
      <span className="text-[12px] font-semibold text-ink-3">€</span>
      </span>
      {failed && (
        <span className="text-[11px] font-bold whitespace-nowrap text-danger">
          {t('priceNotSaved')}
        </span>
      )}
    </span>
  )
}
