export type Role = 'waiter' | 'cashier' | 'admin'

/** Acua is a single-location restaurant. The `branch` concept is retained as
 * a one-value constant ('main') so the shared database schema and all the
 * scoping code keep working unchanged — there is simply only ever one
 * location, and every row resolves to it. */
export const BRANCHES = ['main'] as const
export type Branch = (typeof BRANCHES)[number]

/** Admin view scope. With a single location this is always 'main' (or `null`,
 * treated as "all" — which resolves to the same one location). */
export type BranchScope = Branch | null

export const BRANCH_LABEL: Record<Branch, string> = {
  main: 'Acua',
}

export interface Staff {
  id: string
  name: string
  username: string
  role: Role
  color: string
  active: boolean
  branch: Branch
}

/** Floor "layers" (rooms). Ordering works identically in all of them — a
 * layer is purely where the table stands, INCLUDING the bar: a bar table is
 * seated, ordered and sent to the kitchen exactly like a salon one. The only
 * thing the bar changes is where its ADDITION prints (see BAR_LAYER). */
export type LayerId = 'frontdoor' | 'salon' | 'terrasse' | 'bar' | 'emporter'

/** Which rooms the location has, in display order. The floor map and its
 * layer switcher are driven off this. */
export const BRANCH_LAYERS: Record<Branch, LayerId[]> = {
  main: ['frontdoor', 'salon', 'terrasse', 'bar', 'emporter'],
}

/** The bar floor. Its tables order like any other, but "Imprimer
 * l'addition" sends their bill to the BAR printer instead of the caisse
 * one — the barman settles their own floor without walking to the till. */
export const BAR_LAYER: LayerId = 'bar'

export interface RestaurantTable {
  id: string
  label: string
  seats: number
  zone: string
  layer: LayerId
  sort: number
  vip: boolean
  x: number
  y: number
  /** The location this physical table stands in. Always 'main'. */
  branch: Branch
}

export type SessionStatus = 'waiting' | 'preparing' | 'served'
/** Visual status: 'late' derives from preparing > 45 min since the last
 * ticket was sent, 'closed' from lock, 'cancel_pending' from a caisse
 * cancellation waiting for an admin to confirm it on the map. */
export type TableStatus = 'free' | SessionStatus | 'late' | 'closed' | 'cancel_pending'

export interface TableSession {
  id: string
  /** Stamped from the seating employee's branch and never changed —
   * a night's orders must not move if someone is reassigned mid-service. */
  branch: Branch
  table_ids: string[]
  waiter_id: string
  /** The waiter CREDITED for this table's revenue. Set at seat time and
   * only changed by a real waiter-to-waiter handoff — the caisse taking
   * control to print/settle never touches it, so the sale stays with the
   * person who served. Falls back to waiter_id on pre-migration rows. */
  server_id: string | null
  covers: number
  status: SessionStatus
  locked: boolean
  seated_at: string
  first_ticket_at: string | null
  /** When the most recent ticket went to the kitchen — the "late" timer
   * restarts from here, so sending a new order never shows late instantly. */
  last_ticket_at: string | null
  served_at: string | null
  closed_at: string | null
  cancelled: boolean
  cancel_reason: string | null
  /** Caisse asked to cancel; the table stays blocked until an admin
   * confirms (or rejects) it on the map with their password. */
  cancel_requested: boolean
  ticket_seq: number
  /** Remise on the whole bill, percent (0/20/30/40/100). Lives on the
   * session so it can't drift between screens or survive a close/reopen. */
  discount: number
  /** Who a VIP (100%) order was offered to. Admin-only bookkeeping — it is
   * never printed on the customer's receipt. Null unless discount = 100. */
  vip_name: string | null
  /** Staff order: automatic 40% remise, and kept OUT of the main revenue
   * figures (shown in its own "Staff" analytic). Distinguishes a staff meal
   * from an ordinary -40% remise, which stays normal revenue. */
  staff_order: boolean
  /** A "Friends" bill: the whole amount goes on this friend's tab as a debt
   * (a receivable), never as revenue, until they settle up later. */
  friend_id: string | null
  /** When this session is a JOIN of several tables, a snapshot of each
   * original sub-table (its tables + covers) so the merge can be undone and
   * each table restored with the items it originally ordered. Null / absent
   * on a normal single session. */
  merge_parts?: MergePart[] | null
  /** Who currently has this table's ORDER screen open (heartbeated while
   * open). Used to block a take-over from interrupting someone mid-order.
   * Absent on a pre-migration row. */
  editing_by?: string | null
  /** Last heartbeat from the open order screen. The lock is only "live" while
   * this is recent (see EDIT_LOCK_MS) — it auto-releases once the screen
   * closes or the device drops off. */
  editing_at?: string | null
}

/** How long after the last order-screen heartbeat the "someone is ordering"
 * lock stays live. Longer than the heartbeat interval so one missed beat (a
 * brief Wi-Fi blip) doesn't drop the lock, short enough that closing the
 * screen frees the table within a few seconds. */
export const EDIT_LOCK_MS = 18_000

/** Is someone OTHER than `userId` actively ordering on this table right now?
 * True only while their order screen is open and heartbeating; auto-false
 * once they close it / their device sleeps. `now` is the db-synced clock. */
export function editingByOther(
  session: Pick<TableSession, 'editing_by' | 'editing_at'>,
  userId: string,
  now: number,
): boolean {
  if (!session.editing_by || session.editing_by === userId || !session.editing_at) return false
  return now - new Date(session.editing_at).getTime() < EDIT_LOCK_MS
}

/** One original sub-table captured when tables are joined, used to un-merge. */
export interface MergePart {
  /** The sub-table's primary id (table_ids[0]) — items are attributed here. */
  primary: string
  table_ids: string[]
  covers: number
}

/** One of the owner's friends who pays their tab back later. */
export interface Friend {
  id: string
  name: string
  sort: number
  active: boolean
}

/** One bill owed by a friend. `settled` flips when they pay it back. */
export interface FriendDebt {
  id: string
  friend_id: string
  /** Which branch the tab was run up at — the friends LIST is shared
   * between branches, the receivable is not. */
  branch: Branch
  session_id: string | null
  amount: number
  method: 'cash' | 'card'
  /** Day the bill was incurred (YYYY-MM-DD). Backlog rows use the 1st. */
  incurred_on: string
  backlog: boolean
  note: string | null
  settled: boolean
  settled_at: string | null
  settlement_batch: string | null
  created_at: string
}

export interface OrderItem {
  id: string
  session_id: string
  menu_item_id: string | null
  name: string
  price: number
  qty: number
  note: string
  category: string
  ticket_no: number | null
  printed_at: string | null
  paid_qty: number
  voided: boolean
  void_reason: string | null
  payment_id: string | null
  created_at: string
  /** Which table this line belongs to inside a joined session — set at merge
   * time so un-merge can return each line to the right table. Null on lines
   * that were never part of a join. */
  origin_table_id?: string | null
}

export interface Payment {
  id: string
  session_id: string
  cashier_id: string | null
  method: 'cash' | 'card'
  amount: number
  kind: 'full' | 'equal' | 'items'
  created_at: string
}

/** Fixed main-category keys, in display order. Labels live in i18n
 * (`main_<key>`); subcategories point at one via menu_categories.main.
 *
 * They are also the PRINT ROUTING: `food` prints in the kitchen, `drinks`
 * at the bar (see kitchenPrintService). Keeping the split at exactly two
 * means a new subcategory can never be routed wrong — whoever adds it only
 * has to answer "kitchen or bar?", which is the same question the line
 * cooks and the barman ask. */
export const MENU_MAINS = ['food', 'drinks'] as const
export type MenuMain = (typeof MENU_MAINS)[number]

/** Sentinel category for the free drink included with Formulas / Turkish
 * Breakfast items. Routes the line to the BAR printer and prices it at 0. */
export const INCLUDED_DRINK_CATEGORY = 'Boisson incluse'

/** Items the BARMAN makes even though their menu category isn't a drinks
 * one (e.g. Mini Orange lives in Extras Breakfast). Matched on the item
 * name, case-insensitively — their ticket lines print at the bar. */
export const BAR_ROUTED_ITEM_NAMES = [
  'Mini Orange',
  'Granula',
  'Mini Salade de Fruits',
  'Salade de Fruits',
]

/** [fr, en] labels of the drinks a customer can pick with an included-drink
 * breakfast item. Stored/printed under their French name. */
/** Every formula includes one COLD drink and one HOT drink (two of each on
 * the 2-person Kahvalti). The picker shows the two groups separately. */
export const INCLUDED_DRINKS_COLD: ReadonlyArray<readonly [string, string]> = [
  ["Jus d'orange", 'Orange juice'],
  ['Jus de carotte', 'Carrot juice'],
]
export const INCLUDED_DRINKS_HOT: ReadonlyArray<readonly [string, string]> = [
  ['Thé tangérois', "Tangier's tea"],
  ['Thé noir', 'Black tea'],
  ['Thé turc', 'Turkish tea'],
  ['Espresso', 'Espresso'],
  ['Americano', 'Americano'],
  ['Lait chaud/froid', 'Hot/cold milk'],
  ['Café au lait', 'Milk coffee'],
  ['Cappuccino', 'Cappuccino'],
  ['Latte', 'Latte'],
  ['Chocolat chaud', 'Hot chocolate'],
]

/** Subcategories whose items come with an included drink (matched on the
 * stable English name; À La Carte deliberately not included). */
export const DRINK_INCLUDED_CATEGORIES = ['Formulas', 'Turkish Breakfast']

/** Items inside those categories that DON'T come with a drink — adding
 * them skips the drink picker entirely. Matched case-insensitively. */
export const NO_INCLUDED_DRINK_ITEMS = ['Healthy bowls']

export interface MenuCategory {
  id: string
  name_fr: string
  name_en: string
  /** Spanish name. Optional so a DB that predates the Spanish column still
   * loads — `catName` falls back to the English one. */
  name_es?: string | null
  /** One of MENU_MAINS ('' on a DB that predates the mains migration). */
  main: string
  sort: number
}

/** A category's name in the UI language, falling back to English then
 * French so a half-translated menu still renders something readable. */
export function catName(c: MenuCategory, lang: string): string {
  if (lang === 'es') return c.name_es || c.name_en || c.name_fr
  if (lang === 'en') return c.name_en || c.name_fr
  return c.name_fr || c.name_en
}

export interface MenuItem {
  id: string
  category_id: string
  name: string
  description: string
  price: number
  /** Legacy global flag, kept only as the seed for `menu_stock`. Never read
   * it to decide if an item can be ordered — availability is tracked in the
   * `menu_stock` rows. Use `isAvailable()` against those instead. */
  available: boolean
  sort: number
}

/** Item availability ("rupture de stock"). One row per item; a MISSING row
 * means available, so a newly created menu item is sellable without needing a
 * backfill first. */
export interface MenuStock {
  menu_item_id: string
  branch: Branch
  available: boolean
}

/** Is this item sellable at this branch? Missing row ⇒ yes (see MenuStock). */
export function isAvailable(stock: MenuStock[], itemId: string, branch: Branch): boolean {
  const row = stock.find((s) => s.menu_item_id === itemId && s.branch === branch)
  return row ? row.available : true
}

export interface ActivityLog {
  id: string
  staff_id: string | null
  branch: Branch
  action: string
  table_ref: string
  detail: Record<string, unknown>
  at: string
}

export const LATE_AFTER_MIN = 45

export function visualStatus(s: TableSession | undefined, now: number): TableStatus {
  if (!s) return 'free'
  if (s.cancel_requested) return 'cancel_pending' // waiting for admin confirm
  if (s.locked) return 'closed' // bill printed at the till — locked for edits
  const lateAnchor = s.last_ticket_at ?? s.first_ticket_at
  if (
    s.status === 'preparing' &&
    lateAnchor &&
    now - new Date(lateAnchor).getTime() > LATE_AFTER_MIN * 60_000
  )
    return 'late'
  return s.status
}

/** Timestamp the current status started at (for the timer). */
export function statusAnchor(s: TableSession): string {
  if (s.status === 'served' && s.served_at) return s.served_at
  if (s.status === 'preparing' && s.first_ticket_at) return s.first_ticket_at
  return s.seated_at
}

/**
 * `table_ids` stores stable ids (e.g. "TER-1", "SAL-VIP"), never show them
 * to a human — always resolve to the floor-plan label ("T1", "Salon VIP").
 */
export function labelsFor(tables: RestaurantTable[], ids: string[]): string {
  return ids.map((id) => tables.find((tb) => tb.id === id)?.label ?? id).join('+')
}
