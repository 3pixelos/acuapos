import { supabase } from '../lib/supabase'
import type { Branch, MenuItem, MergePart, OrderItem, TableSession } from '../lib/types'
import { editingByOther, INCLUDED_DRINK_CATEGORY, labelsFor } from '../lib/types'
import {
  dbNow,
  pendingItems,
  pendingSessions,
  sessionForTable,
  sessionsForTable,
  sessionPaid,
  sessionTotal,
  useData,
} from './data'
import { localDay } from '../lib/serviceDay'
import { useAuth } from './auth'
import { notifyAdmins } from '../lib/push'

/* Latency policy: every action patches the local store FIRST (the UI must
 * never wait on a network round-trip), then writes to Supabase, then kicks
 * a background refresh to reconcile. The journal insert is always
 * fire-and-forget. Realtime events trigger their own refresh, so a lost
 * background refresh self-heals within a second. */

/** The branch the acting employee belongs to. An admin acting on the floor
 * (taking over a table, confirming a cancel) has no branch of their own, so
 * fall back to the branch of the session they're touching. */
export function actingBranch(session?: TableSession): Branch {
  const u = useAuth.getState().user
  if (u && u.role !== 'admin') return u.branch
  return session?.branch ?? 'main'
}

function log(
  staffId: string,
  action: string,
  tableRef: string,
  detail: object = {},
  branch: Branch = actingBranch(),
) {
  // NOTE: a supabase query builder is lazy — it only sends the request
  // once .then() is attached. A bare `void builder` NEVER fires, which
  // silently emptied the whole admin journal. Keep the .then().
  supabase
    .from('activity_log')
    .insert({ staff_id: staffId, action, table_ref: tableRef, detail, branch })
    .then(({ error }) => {
      if (error) console.error('[journal] insert failed:', error)
    })
}

const refresh = () => useData.getState().refresh()
const bgRefresh = () => void refresh()

/** `table_ids` are stable ids ("TER-1") — journal entries must show labels ("T1"). */
const labelsOf = (ids: string[]) => labelsFor(useData.getState().tables, ids)

// Timestamps are written in DATABASE time (see dbNow), never raw device
// time — a phone with a wrong clock must not poison the late timers.
const nowIso = () => new Date(dbNow()).toISOString()

/** Run a Supabase write, retrying on a network hiccup / transient error.
 * Flaky café Wi-Fi drops the odd request; without a retry a multi-item
 * transfer would silently leave some rows behind. Returns true once the
 * write lands, false if it never did after `tries` attempts. */
async function runWrite(
  label: string,
  thunk: () => PromiseLike<{ error: unknown }>,
  tries = 4,
): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try {
      const { error } = await thunk()
      if (!error) return true
      console.warn(`[${label}] attempt ${i + 1}/${tries} failed:`, error)
    } catch (e) {
      console.warn(`[${label}] attempt ${i + 1}/${tries} threw:`, e)
    }
    await new Promise((r) => setTimeout(r, 250 * (i + 1)))
  }
  console.error(`[${label}] gave up after ${tries} attempts`)
  return false
}

/** Reject a hung promise after `ms` so a dead Wi-Fi socket can't leave a
 * request pending forever (which would freeze the "send to kitchen" button
 * behind its in-flight guard). */
function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out`)), ms)),
  ])
}

/** crypto.randomUUID with a fallback for the old Android WebViews. */
function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Write server_id best-effort. CRITICAL: a supabase builder is lazy — it
 * only sends the request once `.then()` is attached (see log()). A bare
 * `void builder` NEVER fires, so this MUST keep the .then(). 42703 = the
 * column isn't there yet (migration lag) → ignore; reads fall back to
 * waiter_id until it lands. */
const setServerId = (sessionId: string, serverId: string) => {
  supabase
    .from('table_sessions')
    .update({ server_id: serverId })
    .eq('id', sessionId)
    .then(({ error }) => {
      if (error && error.code !== '42703') console.error('[server_id] write failed:', error)
    })
}

/** Tag order lines with the table they belong to, so a later un-merge can
 * hand each line back. Best-effort & only fills blanks (keeps a deeper origin
 * from a nested merge). 42703 = column not migrated yet → ignore. */
const setOrigin = (itemIds: string[], tableId: string) => {
  if (!itemIds.length) return
  supabase
    .from('order_items')
    .update({ origin_table_id: tableId })
    .in('id', itemIds)
    .is('origin_table_id', null)
    .then(({ error }) => {
      if (error && (error as { code?: string }).code !== '42703')
        console.error('[origin] write failed:', error)
    })
}

/** Persist (or clear) the join snapshot on a session. Best-effort; 42703 =
 * column not migrated yet → the un-merge button just won't appear until it is. */
const setMergeParts = (sessionId: string, parts: MergePart[] | null) => {
  supabase
    .from('table_sessions')
    .update({ merge_parts: parts })
    .eq('id', sessionId)
    .then(({ error }) => {
      if (error && (error as { code?: string }).code !== '42703')
        console.error('[merge_parts] write failed:', error)
    })
}

/** Flatten a session into its join sub-parts: if it was itself a join, reuse
 * its parts (so nested joins un-merge all the way); otherwise it's one part. */
const partsOf = (s: TableSession): MergePart[] =>
  s.merge_parts && s.merge_parts.length
    ? s.merge_parts
    : [{ primary: s.table_ids[0], table_ids: s.table_ids, covers: s.covers }]

const patchSession = (id: string, p: Partial<TableSession>) =>
  useData.setState((st) => ({
    sessions: st.sessions.map((s) => (s.id === id ? { ...s, ...p } : s)),
  }))

const patchItem = (id: string, p: Partial<OrderItem>) =>
  useData.setState((st) => ({
    items: st.items.map((i) => (i.id === id ? { ...i, ...p } : i)),
  }))

/**
 * Seat a table. Fully optimistic: builds the session locally with a
 * client-generated id and returns it synchronously, so the order drawer
 * opens the instant the waiter taps "Installer la table" — no waiting on
 * the network. The INSERT lands in the background; `pendingSessions`
 * shields the row from a racing refresh until it's confirmed.
 */
/**
 * Seat requests currently in flight, keyed by table id.
 *
 * Seating stopped being instant the moment it began asking the database
 * whether the table was already taken — that check can take up to two
 * seconds. For those two seconds the confirm button was still live and the
 * store still had no session, so a second tap (an impatient finger on a
 * touchscreen) ran the whole function again, passed the same "nothing here
 * yet" check, and inserted a SECOND session for the same table. That is how
 * T2 ended up with two sessions 62 ms apart.
 *
 * Registering the attempt synchronously — before anything is awaited — means
 * a second tap joins the first request instead of racing it, and both get the
 * same session back.
 */
const seatInFlight = new Map<string, Promise<TableSession>>()

export function seatTable(
  tableIds: string[],
  waiterId: string,
  covers: number,
): Promise<TableSession> {
  for (const id of tableIds) {
    const already = seatInFlight.get(id)
    if (already) return already // a request for this table is already running
  }
  const p = seatTableUnguarded(tableIds, waiterId, covers)
  // set synchronously: nothing can interleave between the call above and here
  for (const id of tableIds) seatInFlight.set(id, p)
  const release = () => {
    for (const id of tableIds) if (seatInFlight.get(id) === p) seatInFlight.delete(id)
  }
  p.then(release, release)
  return p
}

async function seatTableUnguarded(
  tableIds: string[],
  waiterId: string,
  covers: number,
): Promise<TableSession> {
  // Never open a SECOND session on a table that already has an open one.
  // If a table momentarily looked free (a dropped refresh, a realtime gap,
  // a branch race) and someone re-seated it, we used to create a duplicate
  // session: the floor's `find` then showed one and hid the other, so the
  // "old" table seemed to vanish and only came back when the duplicate was
  // freed. Adopt the existing session instead — the caller opens its drawer.
  // If several are somehow open on it, adopt the one actually in use (the
  // same one the floor tile shows), never an empty stray.
  const { sessions: localSessions } = useData.getState()
  for (const id of tableIds) {
    const localOpen = sessionForTable(localSessions, id)
    if (localOpen) return localOpen
  }
  // Not in THIS device's store — but the store can be briefly stale (that's
  // exactly what makes a busy table look free). So check the DATABASE before
  // creating, and adopt any open session already sitting on the table. Capped
  // with a timeout so seating still works instantly when the network is down
  // (an offline duplicate is unavoidable and rare; a stale-store one is not).
  try {
    const { data } = await withTimeout(
      supabase.from('table_sessions').select('*').is('closed_at', null).overlaps('table_ids', tableIds).limit(1),
      2000,
      'seat:dupe-check',
    )
    const existing = (data ?? [])[0] as TableSession | undefined
    if (existing) {
      // make sure the floor/drawer can see it, then hand it back
      useData.setState((st) =>
        st.sessions.some((s) => s.id === existing.id) ? {} : { sessions: [...st.sessions, existing] },
      )
      bgRefresh()
      return existing
    }
  } catch {
    /* offline / slow — fall through and seat optimistically */
  }
  // Take the branch from the TABLE, not from whoever is holding the phone.
  // Which restaurant a table stands in is a physical fact; the acting user's
  // branch is only a guess at it, and when the two disagreed the session was
  // stamped with one branch while pointing at the other branch's table — so
  // it rendered on NEITHER floor map (each map filters tables by branch and
  // sessions by branch) while still counting toward "encaissements à venir".
  // An invisible table cannot be served or billed.
  const branch =
    useData.getState().tables.find((t) => t.id === tableIds[0])?.branch ?? actingBranch()
  const session: TableSession = {
    id: uuid(),
    branch,
    table_ids: tableIds,
    waiter_id: waiterId,
    server_id: waiterId,
    covers,
    status: 'waiting',
    locked: false,
    seated_at: nowIso(),
    first_ticket_at: null,
    last_ticket_at: null,
    served_at: null,
    closed_at: null,
    cancelled: false,
    cancel_reason: null,
    cancel_requested: false,
    ticket_seq: 0,
    discount: 0,
    vip_name: null,
    staff_order: false,
    friend_id: null,
  }
  pendingSessions.set(session.id, session)
  useData.setState((st) => ({ sessions: [...st.sessions, session] }))
  const insert = supabase
    .from('table_sessions')
    .insert({ id: session.id, table_ids: tableIds, waiter_id: waiterId, covers, branch })
    .then(({ error }) => {
      pendingSessions.delete(session.id)
      sessionInsertInFlight.delete(session.id)
      if (error) {
        // roll back the phantom table so it can't take orders into the void
        useData.setState((st) => ({ sessions: st.sessions.filter((s) => s.id !== session.id) }))
        console.error('[seat] insert failed:', error)
        return
      }
      setServerId(session.id, waiterId) // credit the seating waiter (best-effort)
      bgRefresh()
    })
  sessionInsertInFlight.set(session.id, insert)
  log(waiterId, 'seat', labelsOf(tableIds), { covers })
  return session
}

/** In-flight seat INSERTs — item writes for that session must queue behind
 * them or they'd hit a foreign key that doesn't exist yet. Never blocks the
 * UI (local rows are already in the store), only the background write. */
const sessionInsertInFlight = new Map<string, PromiseLike<unknown>>()
const afterSessionInsert = (sessionId: string) =>
  sessionInsertInFlight.get(sessionId) ?? Promise.resolve()

const rank = (s: TableSession['status']) => ({ waiting: 0, preparing: 1, served: 2 })[s]
const earlier = (a: string | null, b: string | null) =>
  !a ? b : !b ? a : new Date(a) < new Date(b) ? a : b
const later = (a: string | null, b: string | null) =>
  !a ? b : !b ? a : new Date(a) > new Date(b) ? a : b

/**
 * Merge any mix of tables into one session: `target` absorbs every other
 * session's items + tables, plus any free tables. Used for joining 2+ tables.
 */
export async function joinTablesMulti(
  target: TableSession,
  others: TableSession[],
  freeTableIds: string[],
) {
  const all = [target, ...others]
  const otherIds = new Set(others.map((s) => s.id))
  // Snapshot each original table (flattening nested joins) so the merge can be
  // undone later, and remember which lines belong to which table's primary.
  const parts: MergePart[] = all.flatMap(partsOf)
  const storeItems = useData.getState().items
  const originPlan = all.map((s) => ({
    primary: s.table_ids[0],
    itemIds: storeItems.filter((i) => i.session_id === s.id && !i.voided).map((i) => i.id),
  }))
  const merged: Partial<TableSession> = {
    table_ids: [...target.table_ids, ...others.flatMap((s) => s.table_ids), ...freeTableIds],
    covers: all.reduce((n, s) => n + s.covers, 0),
    // keep the most advanced status and earliest timestamps
    status: all.reduce((best, s) => (rank(s.status) > rank(best) ? s.status : best), target.status),
    seated_at: all.map((s) => s.seated_at).reduce((a, b) => earlier(a, b)!),
    first_ticket_at: all.map((s) => s.first_ticket_at).reduce((a, b) => earlier(a, b)),
    // late timer restarts from the most recent ticket of the merged group
    last_ticket_at: all.map((s) => s.last_ticket_at).reduce((a, b) => later(a, b)),
    ticket_seq: Math.max(...all.map((s) => s.ticket_seq)),
  }
  const closedAt = nowIso()

  // optimistic: merged tile appears instantly, absorbed tiles free up
  useData.setState((st) => ({
    sessions: st.sessions
      .filter((s) => !otherIds.has(s.id))
      .map((s) => (s.id === target.id ? { ...s, ...merged } : s)),
    items: st.items.map((i) => (otherIds.has(i.session_id) ? { ...i, session_id: target.id } : i)),
  }))

  await Promise.all([
    ...others.map((src) =>
      supabase.from('order_items').update({ session_id: target.id }).eq('session_id', src.id),
    ),
    supabase.from('table_sessions').update(merged).eq('id', target.id),
  ])
  await Promise.all(
    others.map((src) =>
      supabase
        .from('table_sessions')
        .update({ closed_at: closedAt, cancelled: true, cancel_reason: 'merged' })
        .eq('id', src.id),
    ),
  )
  // Record the un-merge data (best-effort; no-op until the columns migrate).
  for (const p of originPlan) setOrigin(p.itemIds, p.primary)
  setMergeParts(target.id, parts)
  patchSession(target.id, { merge_parts: parts })
  log(target.waiter_id, 'join', labelsOf(merged.table_ids!))
  bgRefresh()
}

/**
 * Undo a join: rebuild every original sub-table and hand each one back the
 * lines it ordered (by their recorded origin table). Lines added after the
 * join — or too old to carry an origin — stay on the primary table. Works
 * regardless of served / locked state; the pieces come back unlocked so each
 * can be billed on its own.
 */
export async function splitMerge(session: TableSession, staffId: string) {
  // A join is anything spanning >1 physical table. Prefer the recorded
  // sub-table snapshot (>=2 real parts); otherwise fall back to one piece per
  // table (covers a session joined with FREE tables, or a pre-tracking merge).
  const rich = session.merge_parts && session.merge_parts.length >= 2 ? session.merge_parts : null
  if (!rich && session.table_ids.length < 2) return // nothing to undo

  const items = useData.getState().items.filter((i) => i.session_id === session.id && !i.voided)
  const keep: MergePart = rich
    ? rich[0]
    : { primary: session.table_ids[0], table_ids: [session.table_ids[0]], covers: session.covers }
  const spin: MergePart[] = rich
    ? rich.slice(1)
    : session.table_ids.slice(1).map((tid) => ({ primary: tid, table_ids: [tid], covers: 1 }))

  // Attributes every restored piece shares with the (current) group.
  // branch comes from the group being split — a piece can't land in the
  // other branch just because whoever tapped the button belongs there.
  const shared = {
    branch: session.branch,
    waiter_id: session.waiter_id,
    server_id: session.server_id,
    status: session.status,
    seated_at: session.seated_at,
    first_ticket_at: session.first_ticket_at,
    last_ticket_at: session.last_ticket_at,
    served_at: session.served_at,
    discount: session.discount,
    vip_name: session.vip_name,
    staff_order: session.staff_order,
    friend_id: session.friend_id,
  }

  for (const part of spin) {
    const inPart = new Set(part.table_ids)
    const moveIds = items
      .filter((i) => i.origin_table_id && inPart.has(i.origin_table_id))
      .map((i) => i.id)

    // In the fallback case an empty piece is just a table that was joined in
    // with no order of its own — free it (drop from the group), don't recreate.
    if (!rich && moveIds.length === 0) continue

    let newId: string | null = null
    for (let i = 0; i < 4 && !newId; i++) {
      const { data, error } = await supabase
        .from('table_sessions')
        .insert({ ...shared, table_ids: part.table_ids, covers: part.covers, locked: false })
        .select()
        .single()
      if (!error && data) newId = (data as TableSession).id
      else await new Promise((r) => setTimeout(r, 250 * (i + 1)))
    }
    if (!newId) throw new Error('split: could not recreate a table')
    if (session.server_id) setServerId(newId, session.server_id)
    if (moveIds.length)
      await runWrite('split:move', () =>
        supabase.from('order_items').update({ session_id: newId }).in('id', moveIds),
      )
  }

  // The current session collapses back to the first sub-table (keeps its own
  // lines + any post-join / origin-less lines), and is no longer a join.
  await runWrite('split:keep', () =>
    supabase
      .from('table_sessions')
      .update({ table_ids: keep.table_ids, covers: keep.covers, merge_parts: null, locked: false })
      .eq('id', session.id),
  )
  log(staffId, 'split', labelsOf(session.table_ids), {
    into: [keep, ...spin].map((p) => labelsOf(p.table_ids)),
  })
  await refresh()
}

/**
 * Add a brand-new order line: show it instantly, then write it.
 *
 * The optimistic row is registered in `pendingItems` for the whole flight of
 * the INSERT, so a refresh landing mid-write can't wipe it from the store.
 * When it did, the line was invisible while still being saved — the next tap
 * on the same dish couldn't find it to bump, and "send to kitchen" couldn't
 * see it to stamp, which is how one order ended up with two identical lines
 * on two different tickets. On a failed write the row is rolled back, so a
 * line can never be billed or cooked without existing in the database.
 */
async function insertLine(row: OrderItem, payload: Record<string, unknown>) {
  pendingItems.set(row.id, row)
  useData.setState((st) => ({ items: [...st.items, row] }))
  try {
    await afterSessionInsert(row.session_id)
    const { error } = await supabase.from('order_items').insert(payload)
    if (error) {
      useData.setState((st) => ({ items: st.items.filter((i) => i.id !== row.id) }))
      console.error('[add_line] insert failed:', error)
    }
  } finally {
    pendingItems.delete(row.id)
  }
}

export async function addItem(sessionId: string, m: MenuItem, category: string) {
  // Tapping the same menu item again bumps the quantity of the existing
  // un-sent line instead of creating a duplicate row.
  const existing = useData
    .getState()
    .items.find(
      (i) =>
        i.session_id === sessionId &&
        i.menu_item_id === m.id &&
        i.ticket_no === null &&
        !i.voided,
    )
  if (existing) {
    patchItem(existing.id, { qty: existing.qty + 1 })
    await supabase
      .from('order_items')
      .update({ qty: existing.qty + 1 })
      .eq('id', existing.id)
  } else {
    // client-generated id so the row can exist locally before the insert lands
    const row: OrderItem = {
      id: uuid(),
      session_id: sessionId,
      menu_item_id: m.id,
      name: m.name,
      price: m.price,
      qty: 1,
      note: '',
      category,
      ticket_no: null,
      printed_at: null,
      paid_qty: 0,
      voided: false,
      void_reason: null,
      payment_id: null,
      created_at: nowIso(),
    }
    await insertLine(row, {
      id: row.id,
      session_id: sessionId,
      menu_item_id: m.id,
      name: m.name,
      price: m.price,
      category,
    })
  }
  bgRefresh()
}

/**
 * Flip an item's availability (rupture de stock). Optimistic on the local
 * menu; realtime + polling spread it to every device within seconds.
 * Requires the anon UPDATE policy on menu_items (stock_policy SQL).
 */
/**
 * Change an item's menu price (admin only). Only affects FUTURE orders —
 * order_items store their own price, so past bills and revenue are frozen
 * at what was actually charged.
 */
export async function setItemPrice(m: MenuItem, price: number, staffId: string) {
  useData.setState((st) => ({
    menu: st.menu.map((x) => (x.id === m.id ? { ...x, price } : x)),
  }))
  const { error } = await supabase.from('menu_items').update({ price }).eq('id', m.id)
  if (error) console.error('[price] update failed:', error)
  log(staffId, 'price', '', { name: m.name, from: m.price, to: price })
  bgRefresh()
}

/**
 * Flip an item in or out of stock. This upserts the
 * (item, branch) row in `menu_stock` — it never touches the shared
 * `menu_items` row.
 */
export async function setItemAvailability(
  m: MenuItem,
  available: boolean,
  staffId: string,
  branch: Branch,
) {
  useData.setState((st) => {
    const has = st.stock.some((s) => s.menu_item_id === m.id && s.branch === branch)
    return {
      stock: has
        ? st.stock.map((s) =>
            s.menu_item_id === m.id && s.branch === branch ? { ...s, available } : s,
          )
        : [...st.stock, { menu_item_id: m.id, branch, available }],
    }
  })
  const { error } = await supabase
    .from('menu_stock')
    .upsert({ menu_item_id: m.id, branch, available }, { onConflict: 'menu_item_id,branch' })
  if (error) console.error('[stock] update failed:', error)
  log(staffId, 'stock', '', { name: m.name, available, branch }, branch)
  bgRefresh()
}

/**
 * Add an order line with a custom display name and price — for
 * customizable items like "Oeufs ×3 — Brouillés" (price computed from the
 * egg count) or "Frappuccino Caramel" (variant of one menu row). Keeps
 * menu_item_id so printer routing and analytics still resolve; identical
 * un-sent lines merge on re-add like normal items.
 */
export async function addCustomItem(
  sessionId: string,
  m: MenuItem,
  category: string,
  name: string,
  price: number,
) {
  const existing = useData
    .getState()
    .items.find(
      (i) => i.session_id === sessionId && i.name === name && i.ticket_no === null && !i.voided,
    )
  if (existing) {
    patchItem(existing.id, { qty: existing.qty + 1 })
    await supabase
      .from('order_items')
      .update({ qty: existing.qty + 1 })
      .eq('id', existing.id)
  } else {
    const row: OrderItem = {
      id: uuid(),
      session_id: sessionId,
      menu_item_id: m.id,
      name,
      price,
      qty: 1,
      note: '',
      category,
      ticket_no: null,
      printed_at: null,
      paid_qty: 0,
      voided: false,
      void_reason: null,
      payment_id: null,
      created_at: nowIso(),
    }
    await insertLine(row, {
      id: row.id,
      session_id: sessionId,
      menu_item_id: m.id,
      name,
      price,
      category,
    })
  }
  bgRefresh()
}

/**
 * The free drink that comes with a Formulas / Turkish Breakfast item.
 * A zero-priced line of its own so the BAR ticket tells the barman what to
 * make; the bill shows it at 0. Same tap-again-merges behaviour as addItem.
 * The line is named after its breakfast item ("Petit Déjeuner Espagnol —
 * Jus d'orange inclus") so the barman knows which order it belongs to.
 */
export async function addIncludedDrink(sessionId: string, drinkFr: string, forItem: string) {
  const name = `${forItem} — ${drinkFr} inclus`
  const existing = useData
    .getState()
    .items.find(
      (i) =>
        i.session_id === sessionId &&
        i.name === name &&
        i.category === INCLUDED_DRINK_CATEGORY &&
        i.ticket_no === null &&
        !i.voided,
    )
  if (existing) {
    patchItem(existing.id, { qty: existing.qty + 1 })
    await supabase
      .from('order_items')
      .update({ qty: existing.qty + 1 })
      .eq('id', existing.id)
  } else {
    const row: OrderItem = {
      id: uuid(),
      session_id: sessionId,
      menu_item_id: null,
      name,
      price: 0,
      qty: 1,
      note: '',
      category: INCLUDED_DRINK_CATEGORY,
      ticket_no: null,
      printed_at: null,
      paid_qty: 0,
      voided: false,
      void_reason: null,
      payment_id: null,
      created_at: nowIso(),
    }
    await insertLine(row, {
      id: row.id,
      session_id: sessionId,
      menu_item_id: null,
      name,
      price: 0,
      category: INCLUDED_DRINK_CATEGORY,
    })
  }
  bgRefresh()
}

export async function setQty(itemId: string, qty: number) {
  const clamped = Math.max(1, qty)
  patchItem(itemId, { qty: clamped })
  await supabase.from('order_items').update({ qty: clamped }).eq('id', itemId)
  bgRefresh()
}

export async function setNote(itemId: string, note: string) {
  patchItem(itemId, { note })
  await supabase.from('order_items').update({ note }).eq('id', itemId)
  bgRefresh()
}

export async function removeCartItem(itemId: string) {
  useData.setState((st) => ({ items: st.items.filter((i) => i.id !== itemId) }))
  await supabase.from('order_items').delete().eq('id', itemId).is('ticket_no', null)
  bgRefresh()
}

export async function voidSentItem(item: OrderItem, waiterId: string, reason: string) {
  patchItem(item.id, { voided: true, void_reason: reason })
  await supabase.from('order_items').update({ voided: true, void_reason: reason }).eq('id', item.id)
  log(waiterId, 'void_item', '', { name: item.name, qty: item.qty, reason })
  bgRefresh()
}

/** Send cart to kitchen. Returns the new ticket number (for printing). */
/**
 * Send the cart to the kitchen. Returns true only once the write is
 * CONFIRMED. On a failed/flaky connection it rolls the optimistic stamp
 * back so the cart stays intact — the waiter then RETRIES the same rows
 * (idempotent) instead of re-typing the order, which is what produced
 * duplicate tickets. Pair with the in-flight guard on the Send button.
 */
export async function sendToKitchen(session: TableSession, cart: OrderItem[]): Promise<boolean> {
  const ticketNo = session.ticket_seq + 1
  const stamp = nowIso()
  const sessionPatch: Partial<TableSession> = {
    ticket_seq: ticketNo,
    status: session.status === 'waiting' ? 'preparing' : session.status,
    first_ticket_at: session.first_ticket_at ?? stamp,
    last_ticket_at: stamp,
  }
  const cartIds = new Set(cart.map((i) => i.id))
  // optimistic: the cart clears instantly
  useData.setState((st) => ({
    sessions: st.sessions.map((s) => (s.id === session.id ? { ...s, ...sessionPatch } : s)),
    items: st.items.map((i) => (cartIds.has(i.id) ? { ...i, ticket_no: ticketNo } : i)),
  }))

  try {
    await withTimeout(afterSessionInsert(session.id), 12_000, 'send_kitchen:session')
    const [itemsRes, sessRes] = await withTimeout(
      Promise.all([
        supabase.from('order_items').update({ ticket_no: ticketNo }).in('id', cart.map((i) => i.id)),
        supabase.from('table_sessions').update(sessionPatch).eq('id', session.id),
      ]),
      12_000,
      'send_kitchen',
    )
    if (itemsRes.error || sessRes.error) throw itemsRes.error || sessRes.error
  } catch (e) {
    // roll the optimistic stamp back — items return to the cart, the
    // session's counters revert — so a retry re-sends the SAME rows.
    useData.setState((st) => ({
      sessions: st.sessions.map((s) =>
        s.id === session.id
          ? {
              ...s,
              ticket_seq: session.ticket_seq,
              status: session.status,
              first_ticket_at: session.first_ticket_at,
              last_ticket_at: session.last_ticket_at,
            }
          : s,
      ),
      items: st.items.map((i) => (cartIds.has(i.id) ? { ...i, ticket_no: null } : i)),
    }))
    console.error('[send_kitchen] failed, rolled back:', e)
    return false
  }

  log(session.waiter_id, 'send_kitchen', labelsOf(session.table_ids), {
    ticket: ticketNo,
    items: cart.length,
    // the exact lines sent, so the journal shows what went to the kitchen
    lines: cart.map((i) => `${i.qty}× ${i.name}`),
  })
  bgRefresh()
  return true
}

export async function markServed(session: TableSession) {
  const p = { status: 'served' as const, served_at: nowIso() }
  patchSession(session.id, p)
  await supabase.from('table_sessions').update(p).eq('id', session.id)
  log(session.waiter_id, 'served', labelsOf(session.table_ids))
  bgRefresh()
}

/**
 * Caisse asks to cancel a table. The table does NOT free up: it turns
 * "cancel_pending" (locked, red on the map) until an admin confirms it on
 * the admin map with their password — or rejects it, which unblocks the
 * table again.
 */
export async function requestCancelSession(session: TableSession, staffId: string, reason: string) {
  const p = { cancel_requested: true, cancel_reason: reason, locked: true }
  patchSession(session.id, p)
  await supabase.from('table_sessions').update(p).eq('id', session.id)
  log(staffId, 'cancel_request', labelsOf(session.table_ids), { reason })
  // ping the admin's phone (push) — best-effort, never blocks the cancel
  notifyAdmins(
    'Acua — Annulation',
    `${labelsOf(session.table_ids)} — annulation demandée`,
    `cancel-${session.id}`,
  )
  bgRefresh()
}

/** Admin confirmed on the map — the table actually closes now. */
export async function confirmCancelSession(session: TableSession, adminId: string) {
  const p = { closed_at: nowIso(), cancelled: true, cancel_requested: false }
  patchSession(session.id, p)
  await supabase.from('table_sessions').update(p).eq('id', session.id)
  log(adminId, 'cancel_table', labelsOf(session.table_ids), { reason: session.cancel_reason })
  bgRefresh()
}

/** Admin rejected the cancellation — the table goes back to service. */
export async function rejectCancelSession(session: TableSession, adminId: string) {
  const p = { cancel_requested: false, cancel_reason: null, locked: false }
  patchSession(session.id, p)
  await supabase.from('table_sessions').update(p).eq('id', session.id)
  log(adminId, 'cancel_reject', labelsOf(session.table_ids))
  bgRefresh()
}

/** Check a staff member's PIN/password without touching their session
 * (used for the admin confirm-on-map step). */
export async function verifyStaffSecret(staffId: string, secret: string): Promise<boolean> {
  const { data } = await supabase.rpc('staff_verify', { p_staff_id: staffId, p_secret: secret })
  return data === true
}

/**
 * Reassign who controls a table. `credit` decides whether the revenue
 * credit (server_id) moves too: a waiter taking another waiter's table to
 * serve it earns the sale (credit = true); the CAISSE taking control just
 * to print/settle must NOT (credit = false) — otherwise the cashier's tally
 * eats the waiter's sales.
 */
export async function takeOverSession(session: TableSession, newWaiterId: string, credit = true) {
  patchSession(session.id, credit ? { waiter_id: newWaiterId, server_id: newWaiterId } : { waiter_id: newWaiterId })
  // waiter_id is the required write; server_id goes through the tolerant
  // helper so a caisse take-control (credit=false) never moves the credit.
  await supabase.from('table_sessions').update({ waiter_id: newWaiterId }).eq('id', session.id)
  if (credit) setServerId(session.id, newWaiterId)
  log(newWaiterId, 'take_over', labelsOf(session.table_ids), { from: session.waiter_id, credit })
  bgRefresh()
}

/* ---------------- caisse: lock / reopen / transfer ---------------- */

/**
 * Explicitly CLOSE the table (status "Fermée"): locks it against waiter
 * edits. Printing and paying no longer do this on their own — the cashier
 * closes when they decide the table is done, and only a closed table can
 * then be freed.
 */
export async function lockSession(session: TableSession, cashierId: string) {
  patchSession(session.id, { locked: true })
  await supabase.from('table_sessions').update({ locked: true }).eq('id', session.id)
  log(cashierId, 'lock_table', labelsOf(session.table_ids))
  bgRefresh()
}

/** Journal trace of a bill print — printing itself changes nothing. */
export function logPrintBill(session: TableSession, cashierId: string) {
  log(cashierId, 'print_bill', labelsOf(session.table_ids))
}

/** Reopen a CLOSED table = new customers. The old session is archived
 * (its items, payments and remise go with it — they must never resurface
 * on the table) and the same tables are seated again from scratch. */
/**
 * Reopening CONTINUES the same order — nothing resets. The table comes
 * back "Servie" with every previous item still on it (already sent and
 * printed, so nothing reprints), just unlocked: the waiter can add new
 * items, sending prints only those, and the bill totals old + new.
 */
export async function reopenSession(session: TableSession, cashierId: string) {
  const p: Partial<TableSession> = {
    locked: false,
    status: 'served',
    served_at: session.served_at ?? nowIso(),
  }
  patchSession(session.id, p)
  // Reopen FULLY unlocks the bill: clear paid_qty on every line so the caisse
  // can move or remove a wrong item that had already been paid. Payments are
  // left as-is, so the balance still reads settled until something changes.
  useData.setState((st) => ({
    items: st.items.map((i) => (i.session_id === session.id ? { ...i, paid_qty: 0 } : i)),
  }))
  await supabase.from('table_sessions').update(p).eq('id', session.id)
  await supabase.from('order_items').update({ paid_qty: 0 }).eq('session_id', session.id)
  log(cashierId, 'reopen_table', labelsOf(session.table_ids))
  bgRefresh()
}

/* ---------------- "someone is ordering" lock ---------------- */

/** Heartbeat: mark that `staffId` has this table's order screen open. Called
 * on open and every few seconds after. Best-effort and tolerant of the column
 * not existing yet (42703) — before the migration the lock simply never
 * engages and take-over behaves as it always did. Deliberately does NOT kick
 * a background refresh: it's a lightweight heartbeat, the realtime event the
 * write itself fires is enough. */
export function markEditing(sessionId: string, staffId: string) {
  const at = nowIso()
  patchSession(sessionId, { editing_by: staffId, editing_at: at })
  supabase
    .from('table_sessions')
    .update({ editing_by: staffId, editing_at: at })
    .eq('id', sessionId)
    .then(({ error }) => {
      if (error && (error as { code?: string }).code !== '42703')
        console.error('[editing] heartbeat failed:', error)
    })
}

/** Release the lock — only if WE still hold it (never clobber a colleague who
 * took the screen over in the meantime). Fired when the order screen closes. */
export function clearEditing(sessionId: string, staffId: string) {
  patchSession(sessionId, { editing_by: null, editing_at: null })
  supabase
    .from('table_sessions')
    .update({ editing_by: null, editing_at: null })
    .eq('id', sessionId)
    .eq('editing_by', staffId)
    .then(({ error }) => {
      if (error && (error as { code?: string }).code !== '42703')
        console.error('[editing] clear failed:', error)
    })
}

/** Set the remise (percent, on the whole bill). Persisted on the session so
 * every screen agrees and it dies with the session when the table closes. */
/**
 * Set the remise. A VIP (100%) also records WHO it was offered to —
 * tracked for the admin only, never printed on the customer's receipt.
 * Any other remise clears the name.
 */
export async function setSessionDiscount(
  session: TableSession,
  discount: number,
  cashierId: string,
  vipName?: string,
  staff = false,
) {
  // vip_name doubles as the recipient name for a staff meal (a session is
  // either VIP or Staff, never both), so no extra column is needed.
  const name = discount === 100 || staff ? (vipName?.trim() || null) : null
  patchSession(session.id, { discount, vip_name: name, staff_order: staff })
  // staff_order is written ATOMICALLY with discount/vip_name — writing it
  // separately (the old best-effort path) could silently fail and leave a
  // staff meal marked as a plain -40% remise, missing from the staff tab.
  await supabase
    .from('table_sessions')
    .update({ discount, vip_name: name, staff_order: staff })
    .eq('id', session.id)
  log(cashierId, 'discount', labelsOf(session.table_ids), { discount, vip: name ?? undefined, staff: staff || undefined })
  bgRefresh()
}

/* ---------------- friends (owed tabs — receivables, not revenue) ---------------- */

/** The SERVICE day (05:00 → 05:00) a friend's bill belongs to, in DB time.
 * Service runs past midnight, so a tab booked at 01:30 belongs to the night
 * that is still in progress — not to the calendar date that just started.
 * This used to be the plain calendar date, which put every after-midnight
 * friend bill on the following day and made the friends figure disagree with
 * revenue, staff and VIP (all of which already use the 05:00 boundary). */
const serviceDayStr = () => localDay(nowIso())

/** Put a table on a friend's tab. Full price — clears any VIP/Staff/remise,
 * since a friend pays the whole bill back later. */
export async function setSessionFriend(
  session: TableSession,
  friendId: string,
  cashierId: string,
  discount = 0,
) {
  const p = { friend_id: friendId, discount, vip_name: null, staff_order: false }
  patchSession(session.id, p)
  await supabase
    .from('table_sessions')
    .update({ friend_id: friendId, discount, vip_name: null, staff_order: false })
    .eq('id', session.id)
  const fname = useData.getState().friends.find((f) => f.id === friendId)?.name ?? ''
  log(cashierId, 'friend_set', labelsOf(session.table_ids), { friend: fname, discount })
  bgRefresh()
}

/**
 * A friend's table offered as VIP: the order is comped under the friend's
 * NAME, so it lands in the VIP analytics — and deliberately NOT on the
 * friend's tab (friend_id cleared), because nothing is owed.
 */
export async function setSessionFriendVip(
  session: TableSession,
  friendName: string,
  cashierId: string,
) {
  const p = { friend_id: null, discount: 100, vip_name: friendName, staff_order: false }
  patchSession(session.id, p)
  await supabase
    .from('table_sessions')
    .update({ friend_id: null, discount: 100, vip_name: friendName, staff_order: false })
    .eq('id', session.id)
  log(cashierId, 'discount', labelsOf(session.table_ids), { discount: 100, vip: friendName })
  bgRefresh()
}

/** Take a table back off a friend's tab (normal bill again). */
export async function clearSessionFriend(session: TableSession, cashierId: string) {
  patchSession(session.id, { friend_id: null })
  await supabase.from('table_sessions').update({ friend_id: null }).eq('id', session.id)
  log(cashierId, 'friend_clear', labelsOf(session.table_ids))
  bgRefresh()
}

/**
 * "Pay" a friend's bill: books the FULL amount as a debt owed by the friend
 * (never a revenue payment) and frees the table. `method` is only a note of
 * how they'll probably settle later. Returns false if nothing to book.
 */
export async function recordFriendDebt(
  session: TableSession,
  method: 'cash' | 'card',
  cashierId: string,
): Promise<boolean> {
  const { items, friends } = useData.getState()
  // the tab records what the friend actually owes — the remise chosen when
  // they were picked (0/20/30/40 %) comes off here
  const amount = sessionTotal(items, session.id) * (1 - (session.discount ?? 0) / 100)
  const friendId = session.friend_id
  if (!friendId || amount <= 0) return false
  // Snapshot WHAT they had onto the debt itself. The session link alone
  // isn't enough: deleting an order (admin) or a data reset would wipe the
  // order_items and leave the friend's tab with no record of the meal.
  const receipt = items
    .filter((i) => i.session_id === session.id && !i.voided)
    .map((i) => `${i.name} x${i.qty}`)
    .join(', ')
  const { error } = await supabase.from('friend_debts').insert({
    friend_id: friendId,
    branch: session.branch, // the receivable belongs to the branch that served it
    session_id: session.id,
    amount,
    method,
    incurred_on: serviceDayStr(),
    note: receipt || null,
  })
  if (error) {
    console.error('[friend] debt insert failed:', error)
    return false // keep the table open — the money must not vanish
  }
  // Booking the tab CLOSES the table (locked), it doesn't free it — the
  // cashier still needs to print the bill, then frees it explicitly with
  // "Libérer la table", exactly like a normal paid table.
  patchSession(session.id, { locked: true })
  await supabase.from('table_sessions').update({ locked: true }).eq('id', session.id)
  const fname = friends.find((f) => f.id === friendId)?.name ?? ''
  log(cashierId, 'friend_debt', labelsOf(session.table_ids), { friend: fname, amount, method })
  await refresh()
  return true
}


/** Mark a batch of a friend's debts settled (paid back) — moves them to the
 * archive AND books the money as real revenue on the day it was collected.
 *
 * A friend's meal is a receivable when incurred (never revenue); the cash
 * only comes into the till when they pay it back, possibly days later. So the
 * settlement is stamped with the pay date (`settled_at`) and the method the
 * cashier actually took it in (`method`), and revenue reports credit it to
 * that day — a friend who ate on the 24th and settles on the 26th lands in
 * the 26th's takings. Returns the batch id that groups this settlement. */
export async function settleFriendDebts(
  debtIds: string[],
  method: 'cash' | 'card' = 'cash',
): Promise<string | null> {
  if (!debtIds.length) return null
  const batch = uuid()
  const { error } = await supabase
    .from('friend_debts')
    .update({
      settled: true,
      settled_at: new Date().toISOString(),
      settlement_batch: batch,
      // overwrite the method with how it was ACTUALLY paid back (the value
      // stored at booking was only a guess of how they'd probably settle).
      method,
    })
    .in('id', debtIds)
  if (error) {
    console.error('[friend] settle failed:', error)
    return null
  }
  await refresh()
  return batch
}

/**
 * Explicitly free a closed/locked table (e.g. settled in cash outside the
 * system, or staff just wants to reset it) instead of waiting for the
 * balance to reach zero automatically.
 */
export async function freeSession(session: TableSession, cashierId: string) {
  const { items, sessions } = useData.getState()
  const total = sessionTotal(items, session.id)
  const billItems = items
    .filter((i) => i.session_id === session.id && !i.voided)
    .map((i) => ({ name: i.name, qty: i.qty, price: i.price }))
  const at = nowIso()
  patchSession(session.id, { closed_at: at })
  // Freeing a table must close EVERY open session on its physical table(s),
  // not just the one in hand. A hidden duplicate twin used to survive the
  // free and resurface the instant this one went — "we already paid and freed
  // T-7 and it came back". The twin is the same table, not a separate bill,
  // so we cancel it. Reflected locally for an instant UI...
  const strays = sessions.filter(
    (s) => s.id !== session.id && !s.closed_at && s.table_ids.some((id) => session.table_ids.includes(id)),
  )
  for (const s of strays)
    patchSession(s.id, { closed_at: at, cancelled: true, cancel_reason: 'Doublon — table libérée' })

  await supabase.from('table_sessions').update({ closed_at: at }).eq('id', session.id)
  // ...and swept authoritatively in the DB, which catches even a duplicate
  // this device never had in its store. Idempotent via `.is('closed_at', null)`.
  await supabase
    .from('table_sessions')
    .update({ closed_at: at, cancelled: true, cancel_reason: 'Doublon — table libérée' })
    .overlaps('table_ids', session.table_ids)
    .neq('id', session.id)
    .is('closed_at', null)
  log(cashierId, 'close_table', labelsOf(session.table_ids), { total, items: billItems })
  if (strays.length)
    log(cashierId, 'auto_dupe', labelsOf(session.table_ids), { closedWithFree: strays.length })
  bgRefresh()
}

/* ---------------- auto-free stale "en attente" tables ---------------- */

/** Free ONE table that's been stuck "en attente" (seated, never ordered) with
 * no activity for over an hour — an abandoned seat that should go back to
 * Libre. Marked cancelled (nothing was ordered, so it's never revenue) and
 * journaled. The `.is('closed_at', null)` guard makes it idempotent, so two
 * devices sweeping at once can't double-close or fight over it. */
async function autoFreeStale(session: TableSession) {
  const p = {
    closed_at: nowIso(),
    cancelled: true,
    cancel_reason: 'Auto — en attente > 1h',
    cancel_requested: false,
  }
  patchSession(session.id, p)
  const { error } = await supabase
    .from('table_sessions')
    .update(p)
    .eq('id', session.id)
    .is('closed_at', null)
  if (error) {
    console.error('[auto-free] failed:', error)
    return
  }
  log(session.waiter_id, 'auto_free', labelsOf(session.table_ids), { seated_at: session.seated_at }, session.branch)
  bgRefresh()
}

/**
 * Sweep the floor and auto-free every table stuck "en attente" for over an
 * hour. "En attente" = status 'waiting': seated but no order ever sent to the
 * kitchen. We free it only when NOTHING has happened for the whole hour — no
 * new order line, and nobody with its order screen open (the editing
 * heartbeat) — so an order being slowly assembled, or a table someone is
 * actively looking at, is never yanked away. Runs on the caisse (the always-on
 * till); realtime then frees the table on every other device too.
 */
export async function sweepStaleWaiting() {
  const cutoff = dbNow() - 60 * 60 * 1000 // one hour ago, in DB time
  const { sessions, items } = useData.getState()
  for (const s of sessions) {
    if (s.closed_at || s.status !== 'waiting') continue
    const lastItem = items
      .filter((i) => i.session_id === s.id && !i.voided)
      .reduce((m, i) => Math.max(m, new Date(i.created_at).getTime()), 0)
    const editing = s.editing_at ? new Date(s.editing_at).getTime() : 0
    const lastActivity = Math.max(new Date(s.seated_at).getTime(), lastItem, editing)
    if (lastActivity < cutoff) await autoFreeStale(s)
  }
}

/* ---------------- clean up duplicate sessions on one table ---------------- */

/**
 * Close the EMPTY strays when a table has ended up with more than one open
 * session, keeping the one that's actually in use.
 *
 * A duplicate is harmless right up to the moment the real table is freed —
 * then the stray surfaces as an occupied table nobody is sitting at ("the old
 * table came back"), and it sits in "encaissements à venir" until someone
 * notices. The floor already prefers the session in use (see
 * sessionForTable), so this only has to sweep the leftovers away.
 *
 * Deliberately conservative: a stray is only closed when it has NO order
 * lines, has never sent a ticket, has taken no money, and nobody has its
 * order screen open. Anything with a trace of real activity is left alone for
 * a human to look at. `.is('closed_at', null)` keeps it idempotent, so two
 * tills sweeping at once can't fight over it.
 */
export async function sweepDuplicateSessions() {
  const { sessions, items, payments, tables } = useData.getState()
  const now = dbNow()
  const doomed = new Map<string, TableSession>()
  for (const tb of tables) {
    const open = sessionsForTable(sessions, tb.id)
    if (open.length < 2) continue
    const keep = sessionForTable(sessions, tb.id)
    for (const s of open) {
      if (!keep || s.id === keep.id) continue
      const hasItems = items.some((i) => i.session_id === s.id)
      const hasMoney = payments.some((p) => p.session_id === s.id)
      const beingEdited = editingByOther(s, '', now) // any live editor at all
      if (hasItems || hasMoney || beingEdited) continue
      if (s.ticket_seq > 0 || s.first_ticket_at) continue
      doomed.set(s.id, s)
    }
  }
  for (const s of doomed.values()) {
    const p = {
      closed_at: nowIso(),
      cancelled: true,
      cancel_reason: 'Auto — doublon (table déjà ouverte)',
      cancel_requested: false,
    }
    patchSession(s.id, p)
    const { error } = await supabase
      .from('table_sessions')
      .update(p)
      .eq('id', s.id)
      .is('closed_at', null)
    if (error) {
      console.error('[dupe-sweep] failed:', error)
      continue
    }
    log(s.waiter_id, 'auto_dupe', labelsOf(s.table_ids), { seated_at: s.seated_at }, s.branch)
  }
  if (doomed.size) bgRefresh()
}

/**
 * Caisse removes one or more UNPAID units from an order — any time, any
 * status, without cancelling the table. Whole lines become voided (kept
 * for history), partial removals just lower the quantity. Journaled as
 * remove_items with the removed names.
 */
export async function caisseRemoveUnits(
  session: TableSession,
  unitCounts: { itemId: string; count: number }[],
  cashierId: string,
) {
  const { items } = useData.getState()
  const removed: string[] = []
  for (const { itemId, count } of unitCounts) {
    const it = items.find((i) => i.id === itemId)
    if (!it) continue
    const removable = Math.min(count, it.qty - it.paid_qty)
    if (removable <= 0) continue
    removed.push(`${removable}× ${it.name}`)
    if (removable === it.qty) {
      patchItem(it.id, { voided: true, void_reason: 'Retiré caisse' })
      await supabase
        .from('order_items')
        .update({ voided: true, void_reason: 'Retiré caisse' })
        .eq('id', it.id)
    } else {
      patchItem(it.id, { qty: it.qty - removable })
      await supabase.from('order_items').update({ qty: it.qty - removable }).eq('id', it.id)
    }
  }
  if (removed.length) log(cashierId, 'remove_items', labelsOf(session.table_ids), { items: removed })
  bgRefresh()
}

/**
 * Move unpaid units to another table (caisse only). Splits a line when only
 * part of its quantity moves; creates a session on the destination if it's free.
 * Money-adjacent, so this one stays fully awaited — correctness over snap.
 */
export async function transferItems(
  source: TableSession,
  unitCounts: { itemId: string; count: number }[],
  destTableId: string,
  cashierId: string,
) {
  const { items, sessions } = useData.getState()

  // resolve / create the destination session (retry the create — losing this
  // to a Wi-Fi blip would strand the whole transfer)
  let dest = sessions.find((s) => !s.closed_at && s.table_ids.includes(destTableId))
  if (!dest) {
    for (let i = 0; i < 4 && !dest; i++) {
      const { data, error } = await supabase
        .from('table_sessions')
        .insert({
          branch: source.branch, // never transfer across branches
          table_ids: [destTableId],
          waiter_id: source.waiter_id,
          covers: 1,
          status: source.status,
          seated_at: nowIso(),
          first_ticket_at: source.first_ticket_at,
          last_ticket_at: source.last_ticket_at,
          served_at: source.served_at,
        })
        .select()
        .single()
      if (!error && data) dest = data as TableSession
      else await new Promise((r) => setTimeout(r, 250 * (i + 1)))
    }
    if (!dest) throw new Error('transfer: could not create destination table')
    setServerId(dest.id, source.server_id ?? source.waiter_id) // carry the credit
  }

  const destId = dest.id

  // Plan every move against a snapshot BEFORE any network call, so a mid-way
  // Wi-Fi drop can't change what we intend to move. Whole-line moves are
  // batched into one request; partial-qty moves need a split (dec + insert).
  const fullIds: string[] = []
  const partials: { it: OrderItem; movable: number }[] = []
  const movedNames: string[] = []
  for (const { itemId, count } of unitCounts) {
    const it = items.find((i) => i.id === itemId)
    if (!it) continue
    const movable = Math.min(count, it.qty - it.paid_qty)
    if (movable <= 0) continue
    movedNames.push(`${movable}× ${it.name}`)
    if (movable === it.qty) fullIds.push(it.id)
    else partials.push({ it, movable })
  }

  // Each partial move becomes a NEW line with a CLIENT-generated id. That id
  // makes the insert idempotent (a retry can't create a duplicate) and lets
  // the line be shielded from a racing refresh — the exact durability new
  // order lines already have. Without it, a dropped "insert" on flaky Wi-Fi
  // lost the moved units for good (the source line had already been shrunk),
  // which is how a transfer's items vanished off the destination table.
  const partialMoves = partials.map(({ it, movable }) => {
    const id = uuid()
    return {
      it,
      movable,
      id,
      want: it.qty - movable, // absolute qty the source should end up at
      // printed_at is carried so the kitchen never re-fires a ticket for food
      // that's already made; a not-yet-printed line is stamped now (it still
      // printed from the SOURCE, where it was ordered).
      dbRow: {
        id,
        session_id: destId,
        menu_item_id: it.menu_item_id,
        name: it.name,
        price: it.price,
        qty: movable,
        note: it.note,
        category: it.category,
        ticket_no: it.ticket_no,
        printed_at: it.printed_at ?? nowIso(),
      },
      storeRow: { ...it, id, session_id: destId, qty: movable, paid_qty: 0 } as OrderItem,
    }
  })

  // Shield the new lines for the whole flight of the transfer so none of the
  // refreshes below can wipe them before their insert is confirmed.
  for (const m of partialMoves) pendingItems.set(m.id, m.storeRow)
  try {
    // Optimistic: reflect the move on-screen immediately (network below).
    useData.setState((st) => {
      let next = st.items.map((i) => (fullIds.includes(i.id) ? { ...i, session_id: destId } : i))
      for (const m of partialMoves) {
        next = next.map((i) => (i.id === m.it.id ? { ...i, qty: m.want } : i))
        next.push(m.storeRow)
      }
      return { items: next }
    })

    // Whole-line moves in a single retried request (idempotent — sets an
    // absolute session_id, so retrying is harmless).
    if (fullIds.length)
      await runWrite('transfer:full', () =>
        supabase.from('order_items').update({ session_id: destId }).in('id', fullIds),
      )

    // Partial moves: INSERT the moved line FIRST, THEN shrink the original.
    // Order matters — if the insert is the write that fails, the source is
    // still whole, so units are never lost. The insert is an idempotent upsert
    // on the client id; the decrement is an absolute set. Both safe to retry.
    for (const m of partialMoves) {
      await runWrite('transfer:split-ins', () =>
        supabase.from('order_items').upsert(m.dbRow, { onConflict: 'id', ignoreDuplicates: true }),
      )
      await runWrite('transfer:split-dec', () =>
        supabase.from('order_items').update({ qty: m.want }).eq('id', m.it.id),
      )
    }

    // Verify against the DATABASE (not the shielded local store) and re-apply
    // anything a flaky connection dropped — this is what makes the transfer
    // durable end to end.
    await refresh()

    // 1) whole-line moves still sitting on the source
    const stuck = fullIds.filter((id) => {
      const cur = useData.getState().items.find((x) => x.id === id)
      return cur && cur.session_id === source.id
    })
    if (stuck.length)
      await runWrite('transfer:retry-stuck', () =>
        supabase.from('order_items').update({ session_id: destId }).in('id', stuck),
      )

    // 2) partial inserts that never landed + source decrements that didn't —
    // checked straight against the DB so a shield can't hide a missing row.
    if (partialMoves.length) {
      const [{ data: present }, { data: srcRows }] = await Promise.all([
        supabase.from('order_items').select('id').in('id', partialMoves.map((m) => m.id)),
        supabase.from('order_items').select('id, qty').in('id', [...new Set(partialMoves.map((m) => m.it.id))]),
      ])
      const presentSet = new Set((present ?? []).map((r) => (r as { id: string }).id))
      const srcQty = new Map(
        (srcRows ?? []).map((r) => [(r as { id: string }).id, (r as { qty: number }).qty]),
      )
      for (const m of partialMoves) {
        if (!presentSet.has(m.id))
          await runWrite('transfer:reins', () =>
            supabase.from('order_items').upsert(m.dbRow, { onConflict: 'id', ignoreDuplicates: true }),
          )
        if (srcQty.get(m.it.id) !== m.want)
          await runWrite('transfer:redec', () =>
            supabase.from('order_items').update({ qty: m.want }).eq('id', m.it.id),
          )
      }
    }
    await refresh()
  } finally {
    // Rows now live in the DB (or were re-pushed) — drop the shields so the
    // next refresh reflects the real state.
    for (const m of partialMoves) pendingItems.delete(m.id)
  }

  // Sync the destination session to the order it just received. Moving a
  // SERVED order into a fresh (or waiting) table must NOT knock it back to
  // "en attente": carry the more-advanced status across (a served source keeps
  // the table served), keep the ticket counter past the highest incoming
  // ticket, and carry the ticket / served timestamps.
  {
    const st = useData.getState()
    const destSession = st.sessions.find((s) => s.id === destId)
    const destItems = st.items.filter((i) => i.session_id === destId && !i.voided)
    const maxTicket = destItems.reduce((m, i) => Math.max(m, i.ticket_no ?? 0), 0)
    if (destSession) {
      const patch: Partial<TableSession> = {}
      if (maxTicket > destSession.ticket_seq) patch.ticket_seq = maxTicket
      // advance to whichever of source / dest is further along the flow
      if (rank(source.status) > rank(destSession.status)) {
        patch.status = source.status
        if (source.status === 'served')
          patch.served_at = destSession.served_at ?? source.served_at ?? nowIso()
      }
      if (maxTicket > 0) {
        if (!destSession.first_ticket_at)
          patch.first_ticket_at = source.first_ticket_at ?? nowIso()
        patch.last_ticket_at = later(destSession.last_ticket_at, source.last_ticket_at) ?? nowIso()
      }
      if (Object.keys(patch).length) {
        patchSession(destId, patch)
        await runWrite('transfer:sync-dest', () =>
          supabase.from('table_sessions').update(patch).eq('id', destId),
        )
      }
    }
  }

  const left = useData.getState().items.filter((i) => i.session_id === source.id && !i.voided)
  if (left.length === 0) {
    await runWrite('transfer:free-source', () =>
      supabase.from('table_sessions').update({ closed_at: nowIso() }).eq('id', source.id),
    )
  }
  const destLabel = labelsOf([destTableId])
  log(cashierId, 'transfer', labelsOf(source.table_ids), { to: destLabel, items: movedNames })
  await refresh()
}

/* ---------------- payments (caisse) ---------------- */

export async function recordPayment(
  session: TableSession,
  cashierId: string,
  method: 'cash' | 'card',
  amount: number,
  kind: 'full' | 'equal' | 'items',
  unitCounts: { itemId: string; count: number }[] = [],
  meta: { parts?: number; discount?: number } = {},
) {
  // Optimistic: register the payment in the store IMMEDIATELY so the bill's
  // "remaining" drops to 0 on this very tap and the pay buttons disable before
  // the network round-trip finishes. Without this, a slow insert left the
  // buttons live for seconds and a second tap recorded a duplicate payment.
  const tempId = `tmp-${uuid()}`
  useData.setState((st) => ({
    payments: [
      ...st.payments,
      { id: tempId, session_id: session.id, cashier_id: cashierId, method, amount, kind, created_at: nowIso() },
    ],
  }))
  const { error } = await supabase
    .from('payments')
    .insert({ session_id: session.id, cashier_id: cashierId, method, amount, kind })
  if (error) {
    // roll the optimistic payment back so the bill isn't shown as paid
    useData.setState((st) => ({ payments: st.payments.filter((p) => p.id !== tempId) }))
    throw error
  }

  // NOTE: paying does NOT lock/close the table anymore — the cashier
  // closes it explicitly ("Fermer la table") when the customers are done.

  // per-unit payment: bump paid_qty and build the item-name list for the log
  const itemNames: string[] = []
  if (unitCounts.length) {
    const before = useData.getState().items
    for (const { itemId, count } of unitCounts) {
      const it = before.find((i) => i.id === itemId)
      if (!it) continue
      itemNames.push(`${count}× ${it.name}`)
      await supabase
        .from('order_items')
        .update({ paid_qty: Math.min(it.qty, it.paid_qty + count) })
        .eq('id', itemId)
    }
  }

  const { items, payments } = useData.getState()
  const total = sessionTotal(items, session.id) * (1 - (meta.discount ?? 0) / 100)
  // the optimistic payment is already in the store, so don't add `amount` again
  const paid = sessionPaid(payments, session.id)
  const remainingAfter = Math.max(0, total - paid)

  // Bill fully settled → LOCK every line as paid. A 'full' (or a final equal)
  // payment records the money but never stamped the items paid, so they still
  // looked unpaid and could be transferred off, removed, or paid AGAIN — the
  // payment then orphaned onto an emptied table and the food was double-counted
  // (TER-5: paid 198, items transferred away, 198 left on an empty bill). With
  // paid_qty = qty, transfer/remove see nothing movable and the bill is closed.
  if (remainingAfter <= 0.5) {
    const toLock = useData
      .getState()
      .items.filter((i) => i.session_id === session.id && !i.voided && i.paid_qty < i.qty)
    for (const it of toLock) {
      patchItem(it.id, { paid_qty: it.qty })
      await supabase.from('order_items').update({ paid_qty: it.qty }).eq('id', it.id)
    }
  }

  log(cashierId, 'pay', labelsOf(session.table_ids), {
    method,
    amount,
    kind,
    parts: meta.parts,
    discount: meta.discount || undefined,
    itemNames: itemNames.length ? itemNames : undefined,
    remainingAfter,
  })

  await refresh()
}

/* ---------------- relevé de ventes: print authorisations ---------------- */

export interface ReportRequest {
  id: string
  requested_by: string | null
  requester_name: string
  /** Which branch's till asked (null on pre-migration rows). */
  branch: Branch | null
  scope: string
  period_key: string
  period_label: string
  status: 'pending' | 'approved' | 'denied' | 'printed'
  created_at: string
}

/** Caisse asks the admin for permission to print a sales report. */
export async function requestSalesReport(
  staffId: string,
  requesterName: string,
  scope: string,
  periodKey: string,
  periodLabel: string,
): Promise<ReportRequest | null> {
  const { data, error } = await supabase
    .from('report_requests')
    .insert({
      requested_by: staffId,
      requester_name: requesterName,
      branch: actingBranch(),
      scope,
      period_key: periodKey,
      period_label: periodLabel,
    })
    .select()
    .single()
  if (error) {
    console.error('[report] request failed:', error)
    return null
  }
  log(staffId, 'report_request', '', { scope, period: periodLabel })
  notifyAdmins(
    'Acua — Impression',
    `${requesterName} demande le relevé (${periodLabel})`,
    `report-${(data as ReportRequest).id}`,
  )
  return data as ReportRequest
}

/** Admin approves or denies a pending request. */
export async function decideSalesReport(
  req: ReportRequest,
  adminId: string,
  approve: boolean,
) {
  const { error } = await supabase
    .from('report_requests')
    .update({
      status: approve ? 'approved' : 'denied',
      decided_by: adminId,
      decided_at: nowIso(),
    })
    .eq('id', req.id)
  if (error) console.error('[report] decision failed:', error)
  log(adminId, approve ? 'report_approve' : 'report_deny', '', {
    scope: req.scope,
    period: req.period_label,
    by: req.requester_name,
  })
}

/** Burn the authorisation once the report is printed — one approval, one
 * print, so a stale "approved" row can't be reused later. */
export async function markSalesReportPrinted(req: ReportRequest, staffId: string) {
  const { error } = await supabase
    .from('report_requests')
    .update({ status: 'printed', printed_at: nowIso() })
    .eq('id', req.id)
  if (error) console.error('[report] mark printed failed:', error)
  log(staffId, 'report_print', '', { scope: req.scope, period: req.period_label })
}

/* ---------------- friends: admin management ---------------- */

/** Add a friend to the list the caisse can pick from. */
export async function createFriend(name: string, adminId: string) {
  const sort = (useData.getState().friends.at(-1)?.sort ?? 0) + 1
  const { error } = await supabase.from('friends').insert({ name: name.trim(), sort })
  if (error) throw error
  log(adminId, 'friend_add', '', { name: name.trim() })
  await refresh()
}

export async function renameFriend(friendId: string, name: string, adminId: string) {
  const { error } = await supabase.from('friends').update({ name: name.trim() }).eq('id', friendId)
  if (error) throw error
  log(adminId, 'friend_rename', '', { name: name.trim() })
  await refresh()
}

/**
 * Retire a friend. Deactivates rather than deletes so their past tabs and
 * settled history stay intact — a hard delete would cascade the debts away.
 */
export async function removeFriend(friendId: string, adminId: string) {
  const name = useData.getState().friends.find((f) => f.id === friendId)?.name ?? ''
  const { error } = await supabase.from('friends').update({ active: false }).eq('id', friendId)
  if (error) throw error
  log(adminId, 'friend_remove', '', { name })
  await refresh()
}
