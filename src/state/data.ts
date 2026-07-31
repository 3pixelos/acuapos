import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { scopedBranch } from './auth'
import type {
  Friend,
  FriendDebt,
  MenuCategory,
  MenuItem,
  MenuStock,
  OrderItem,
  Payment,
  RestaurantTable,
  Staff,
  TableSession,
} from '../lib/types'

interface DataState {
  ready: boolean
  connected: boolean
  tables: RestaurantTable[]
  staff: Staff[]
  sessions: TableSession[] // open sessions only
  items: OrderItem[] // items of open sessions
  payments: Payment[] // payments of open sessions
  categories: MenuCategory[]
  menu: MenuItem[]
  /** Per-branch availability. Non-admins only ever hold their own branch's
   * rows; the admin holds both so the stock tab can switch between them. */
  stock: MenuStock[]
  friends: Friend[]
  /** UNSETTLED friend debts only (the outstanding tabs). Settled history is
   * queried on demand in the Friends tab, never held here. */
  friendDebts: FriendDebt[]
  init: () => Promise<void>
  refresh: () => Promise<void>
  /** Drop every cached row. Called on logout so the next person to sign in
   * on this device — possibly from the OTHER branch — starts from an empty
   * store instead of briefly seeing their predecessor's floor. */
  reset: () => void
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null
/** The realtime channel, polling intervals and focus listeners are global
 * and must be wired exactly once per page load. `init` re-runs after a
 * logout (reset clears `ready` so the new user's branch is refetched), so
 * the subscription half of it is guarded separately from the data half. */
let liveWired = false

/** Milliseconds to ADD to this device's clock to get database time.
 * Synced once at init. Every timestamp the app writes and every "is it
 * late yet" comparison goes through this, so a POS PC or phone with a
 * wrong clock can no longer make fresh tickets look 45 minutes old. */
let clockSkewMs = 0
export const dbNow = () => Date.now() + clockSkewMs

async function syncClock() {
  // Preferred: server_now() RPC (millisecond precision).
  try {
    const t0 = Date.now()
    const { data, error } = await supabase.rpc('server_now')
    if (!error && typeof data === 'string') {
      const rtt = Date.now() - t0
      clockSkewMs = new Date(data).getTime() + rtt / 2 - Date.now()
      return
    }
  } catch {
    /* fall through to the header method */
  }
  // Fallback needing NO deployed SQL: every PostgREST response carries a
  // standard HTTP Date header with the server's clock (second precision —
  // ample for a 45-minute lateness threshold). Without this, a phone with
  // a skewed clock judges its own fresh tickets "en retard" instantly.
  try {
    const t0 = Date.now()
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
      cache: 'no-store',
    })
    const header = res.headers.get('date')
    if (header) {
      const rtt = Date.now() - t0
      clockSkewMs = new Date(header).getTime() + rtt / 2 - Date.now()
    }
  } catch {
    /* offline — keep the current skew (0 on first run) */
  }
}

/** Optimistic sessions whose INSERT hasn't been confirmed yet. A refresh
 * that races the insert would otherwise wipe the row out of the store and
 * slam the just-opened order drawer shut. Keyed by session id. */
export const pendingSessions = new Map<string, TableSession>()

/**
 * Optimistic ORDER LINES whose INSERT hasn't been confirmed yet — the same
 * shield as pendingSessions, and for the same reason.
 *
 * Without it, a refresh landing in the gap between "line added to the store"
 * and "INSERT confirmed" replaced `items` wholesale with the server's list,
 * which didn't have the new line yet — so it vanished from the screen while
 * still being written. Two things then went wrong:
 *   1. tapping the same dish again found no un-sent line to bump, so it
 *      created a SECOND row instead of qty 2; and
 *   2. the vanished line wasn't in the cart when "send to kitchen" ran, so
 *      it never got that ticket's number — it reappeared on the next refresh
 *      still un-sent, and went out on the NEXT ticket, minutes later, next
 *      to whatever the waiter added then.
 * That is exactly the S15 case: one Lokum on ticket 1, an identical Lokum
 * stranded until it rode out on ticket 2 with the Lahmacun.
 */
export const pendingItems = new Map<string, OrderItem>()

export const useData = create<DataState>((set, get) => ({
  ready: false,
  connected: true,
  tables: [],
  staff: [],
  sessions: [],
  items: [],
  payments: [],
  categories: [],
  menu: [],
  stock: [],
  friends: [],
  friendDebts: [],

  reset: () => {
    pendingSessions.clear()
    pendingItems.clear()
    set({
      ready: false,
      tables: [],
      sessions: [],
      items: [],
      payments: [],
      friendDebts: [],
      stock: [],
    })
  },

  refresh: async () => {
    // Single-location: scopedBranch() resolves to the one location for
    // waiter/cashier, and null (unscoped) for admin.
    const branch = scopedBranch()
    let sessQ = supabase.from('table_sessions').select('*').is('closed_at', null)
    if (branch) sessQ = sessQ.eq('branch', branch)
    const { data: sessions, error: sessErr } = await sessQ.order('seated_at')
    // A FAILED fetch must never blank the floor. Supabase returns
    // { data: null, error } on a network blip / dropped socket — treating
    // that null as "no open tables" wiped every table off the map and out of
    // the store for a cycle. Staff then re-seated a table that only LOOKED
    // free, creating a second open session for it; the ghost resurfaced when
    // the duplicate was freed ("the old table came back on Libérer"). Bail
    // out and keep the current store — the next poll/realtime tick reconciles.
    // An empty ARRAY (no error) is a real "floor is empty" and DOES apply.
    if (sessErr || sessions == null) {
      console.warn('[refresh] sessions fetch failed — keeping current floor:', sessErr)
      return
    }
    const ids = sessions.map((s) => s.id)
    // categories/menu/tables refetch too: the caisse desktop app runs for
    // days in the tray — menu edits made after it started must still reach
    // it without anyone restarting the app.
    const [
      { data: items, error: itemsErr },
      { data: payments, error: payErr },
      { data: staff },
      { data: categories },
      { data: menu },
      { data: tables },
      { data: friends },
      { data: friendDebts },
      { data: stock },
    ] = await Promise.all([
      ids.length
        ? supabase.from('order_items').select('*').in('session_id', ids).order('created_at')
        : Promise.resolve({ data: [] as OrderItem[], error: null }),
      ids.length
        ? supabase.from('payments').select('*').in('session_id', ids)
        : Promise.resolve({ data: [] as Payment[], error: null }),
      supabase.from('staff_public').select('*'),
      supabase.from('menu_categories').select('*').order('sort'),
      supabase.from('menu_items').select('*').order('sort'),
      // The floor map is scoped to the location, filtered server-side.
      branch
        ? supabase.from('restaurant_tables').select('*').eq('branch', branch).order('id')
        : supabase.from('restaurant_tables').select('*').order('id'),
      // friends tables may not exist yet (migration lag) — errors give null
      supabase.from('friends').select('*').eq('active', true).order('sort'),
      // Friends and their DEBTS are both shared across branches: one guest,
      // one running tab, wherever they ate. `friend_debts.branch` only marks
      // WHICH branch each bill was run up at, for the badge in the admin.
      supabase.from('friend_debts').select('*').eq('settled', false).order('incurred_on'),
      // Availability is per-branch; a till only needs its own rows.
      branch
        ? supabase.from('menu_stock').select('*').eq('branch', branch)
        : supabase.from('menu_stock').select('*'),
    ])
    const st = get()
    const fetched = sessions as TableSession[]
    for (const p of pendingSessions.values()) {
      if (!fetched.some((s) => s.id === p.id)) fetched.push(p)
    }
    // Same "don't clobber on a failed fetch" rule for the order lines and
    // payments that hang off the open tables: on an error keep what we have
    // (an empty bill flashing to zero mid-service is its own small horror),
    // otherwise take the fresh rows. Both are shielded for in-flight inserts.
    const fetchedItems = (itemsErr ? st.items : ((items ?? []) as OrderItem[])).slice()
    for (const p of pendingItems.values()) {
      if (!fetchedItems.some((i) => i.id === p.id)) fetchedItems.push(p)
    }
    const fetchedPayments = payErr ? st.payments : ((payments ?? []) as Payment[])
    // Reference-stable updates: this runs every 20s, and handing out a new
    // array for data that didn't change re-rendered every screen that
    // reads it (charts redrawing, lists flashing). Keep the OLD array
    // whenever the content is identical so React can skip the work.
    const keep = <T>(prev: T[], next: T[]): T[] =>
      JSON.stringify(prev) === JSON.stringify(next) ? prev : next
    set({
      sessions: keep(st.sessions, fetched),
      items: keep(st.items, fetchedItems),
      payments: keep(st.payments, fetchedPayments),
      staff: keep(st.staff, (staff ?? []) as Staff[]),
      categories: keep(st.categories, (categories ?? []) as MenuCategory[]),
      menu: keep(st.menu, (menu ?? []) as MenuItem[]),
      stock: keep(st.stock, (stock ?? []) as MenuStock[]),
      tables: keep(st.tables, (tables ?? []) as RestaurantTable[]),
      friends: keep(st.friends, (friends ?? []) as Friend[]),
      friendDebts: keep(st.friendDebts, (friendDebts ?? []) as FriendDebt[]),
    })
  },

  init: async () => {
    if (get().ready) return
    void syncClock()
    const branch = scopedBranch()
    const [{ data: tables }, { data: categories }, { data: menu }] = await Promise.all([
      branch
        ? supabase.from('restaurant_tables').select('*').eq('branch', branch).order('id')
        : supabase.from('restaurant_tables').select('*').order('id'),
      supabase.from('menu_categories').select('*').order('sort'),
      supabase.from('menu_items').select('*').order('sort'),
    ])
    await get().refresh()
    set({
      tables: (tables ?? []) as RestaurantTable[],
      categories: (categories ?? []) as MenuCategory[],
      menu: (menu ?? []) as MenuItem[],
      ready: true,
    })

    if (liveWired) return
    liveWired = true

    const scheduleRefresh = () => {
      // Coalesce bursts of realtime events into one refetch.
      if (refreshTimer) return
      refreshTimer = setTimeout(() => {
        refreshTimer = null
        void get().refresh()
      }, 250)
    }

    supabase
      .channel('pos-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_sessions' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_categories' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_stock' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_debts' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friends' }, scheduleRefresh)
      .subscribe((status) => {
        set({ connected: status === 'SUBSCRIBED' })
        if (status === 'SUBSCRIBED') void get().refresh()
      })

    // Belt and braces: the realtime socket can die silently (till PC in the
    // tray for days, flaky Wi-Fi, proxies) and every cross-device update
    // depended on it — a waiter's order then never reached the caisse map.
    // Poll fast while the socket is down, and keep a slow heartbeat even
    // while it claims to be up; refetch immediately on window focus.
    setInterval(() => {
      if (!get().connected) void get().refresh()
    }, 5_000)
    setInterval(() => void get().refresh(), 20_000)
    // Clocks drift and phones sleep overnight — resync the DB-time offset
    // periodically and whenever the app comes back to the foreground.
    setInterval(() => void syncClock(), 10 * 60_000)
    const onFocus = () => {
      void get().refresh()
      void syncClock()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') onFocus()
    })
  },
}))

/* ---------------- helpers over the store ---------------- */

/** Latest sign of life on a session: seated, ticketed, or someone with its
 * order screen open. Used to choose between duplicates. */
function activityOf(s: TableSession): number {
  const t = (v: string | null | undefined) => (v ? new Date(v).getTime() : 0)
  return Math.max(t(s.seated_at), t(s.first_ticket_at), t(s.last_ticket_at), t(s.editing_at))
}

/**
 * The session a table SHOWS on the floor.
 *
 * Normally there is exactly one. But if a table ever ends up with two open
 * sessions (two people seating it in the same instant, a double-tap while the
 * seat request was still resolving), a blind `find` returned whichever sorted
 * first — routinely the EMPTY one. The waiter's order had gone into the other,
 * so the tile showed the table as untouched: "we sent it to the kitchen and
 * the table went blank." They then re-typed the whole order and the kitchen
 * cooked it twice.
 *
 * So when there's a choice, show the session that's actually being used — the
 * one with the most recent ticket or open order screen. The order on screen
 * then always matches the order the kitchen received.
 */
export function sessionForTable(sessions: TableSession[], tableId: string) {
  let best: TableSession | undefined
  let bestScore = -1
  for (const s of sessions) {
    if (s.closed_at || !s.table_ids.includes(tableId)) continue
    const score = activityOf(s)
    if (!best || score > bestScore) {
      best = s
      bestScore = score
    }
  }
  return best
}

/** Every open session on a table — normally one. More than one means a
 * duplicate got created and needs cleaning up (see sweepDuplicateSessions). */
export function sessionsForTable(sessions: TableSession[], tableId: string) {
  return sessions.filter((s) => !s.closed_at && s.table_ids.includes(tableId))
}

export function sessionTotal(items: OrderItem[], sessionId: string) {
  return items
    .filter((i) => i.session_id === sessionId && !i.voided)
    .reduce((t, i) => t + i.price * i.qty, 0)
}

export function sessionPaid(payments: Payment[], sessionId: string) {
  return payments
    .filter((p) => p.session_id === sessionId)
    .reduce((t, p) => t + p.amount, 0)
}
