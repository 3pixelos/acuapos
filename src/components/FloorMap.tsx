import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Crown, Users } from 'lucide-react'
import type { OrderItem, RestaurantTable, Staff, TableSession, TableStatus } from '../lib/types'
import { statusAnchor, visualStatus } from '../lib/types'
import { dur, money } from '../lib/format'
import { dbNow, sessionForTable, sessionTotal } from '../state/data'
import { STATUS_META } from './ui'
import { useI18n } from '../lib/i18n'

export interface TileView {
  table: RestaurantTable
  session?: TableSession
  status: TableStatus
  elapsedMs: number
  total: number
  waiter?: Staff
  isPrimary: boolean
  joinedLabels: string[] | null
}

// 4s is coarse enough that timers still feel live, but cuts the number of
// re-renders (and forced-layout work below) 4x versus a 1s tick — matters
// on lower-power phones with 50+ tiles on screen.
export function useNow(intervalMs = 4000) {
  // database-synced clock, so "late" judgments agree across devices
  const [now, setNow] = useState(dbNow())
  useEffect(() => {
    const id = setInterval(() => setNow(dbNow()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export function buildTileViews(
  layerTables: RestaurantTable[],
  allTables: RestaurantTable[],
  sessions: TableSession[],
  items: OrderItem[],
  staff: Staff[],
  now: number,
): TileView[] {
  return layerTables.map((table) => {
    const session = sessionForTable(sessions, table.id)
    const status = visualStatus(session, now)
    return {
      table,
      session,
      status,
      elapsedMs: session ? now - new Date(statusAnchor(session)).getTime() : 0,
      total: session ? sessionTotal(items, session.id) : 0,
      waiter: session ? staff.find((s) => s.id === session.waiter_id) : undefined,
      isPrimary: session ? session.table_ids[0] === table.id : true,
      joinedLabels:
        session && session.table_ids.length > 1
          ? session.table_ids.map((id) => allTables.find((tb) => tb.id === id)?.label ?? id)
          : null,
    }
  })
}

interface Line {
  id: string
  color: string
  points: string
}

export function FloorMap({
  views,
  showWaiter,
  highlightWaiterId,
  selectedIds = [],
  onTap,
  onLongPress,
  className = '',
}: {
  views: TileView[]
  showWaiter?: boolean
  highlightWaiterId?: string
  selectedIds?: string[]
  onTap?: (v: TileView) => void
  onLongPress?: (v: TileView) => void
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const tileRefs = useRef(new Map<string, HTMLElement>())
  // table positions per joined session — only recomputed when the join
  // membership actually changes or the layout resizes, never on a plain
  // timer tick (that would force a layout reflow every few seconds for
  // nothing, which is the main cause of phone jank on a 50+ tile floor).
  const [positions, setPositions] = useState<Map<string, string>>(new Map())
  const viewsRef = useRef(views)
  viewsRef.current = views

  const setTileRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) tileRefs.current.set(id, el)
    else tileRefs.current.delete(id)
  }, [])

  // Identity of the current joined-table groups (which sessions, which
  // tables) — changes only when tables actually get joined/split, not
  // every tick, so it's a stable effect dependency for remeasuring.
  const groupSignature = useMemo(() => {
    const parts: string[] = []
    for (const v of views) {
      if (v.session && v.session.table_ids.length > 1) {
        parts.push(`${v.session.id}:${v.session.table_ids.join(',')}`)
      }
    }
    return [...new Set(parts)].sort().join('|')
  }, [views])

  const measure = useCallback(() => {
    const box = containerRef.current?.getBoundingClientRect()
    if (!box) return
    const groups = new Map<string, TileView[]>()
    for (const v of viewsRef.current) {
      if (v.session && v.session.table_ids.length > 1) {
        groups.set(v.session.id, [...(groups.get(v.session.id) ?? []), v])
      }
    }
    const next = new Map<string, string>()
    for (const [sid, group] of groups) {
      const ordered = group
        .slice()
        .sort(
          (a, b) =>
            a.session!.table_ids.indexOf(a.table.id) - b.session!.table_ids.indexOf(b.table.id),
        )
      const pts: string[] = []
      for (const v of ordered) {
        const el = tileRefs.current.get(v.table.id)
        if (!el) continue
        const r = el.getBoundingClientRect()
        pts.push(`${r.left + r.width / 2 - box.left},${r.top + r.height / 2 - box.top}`)
      }
      if (pts.length > 1) next.set(sid, pts.join(' '))
    }
    setPositions(next)
  }, [])

  useLayoutEffect(() => {
    measure()
  }, [groupSignature, measure])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  // Combine the cached positions with the *current* status color — cheap
  // (no DOM reads), so the line can still recolor live every tick without
  // triggering a remeasure.
  const lines = useMemo(() => {
    if (positions.size === 0) return []
    const statusBySession = new Map<string, TableStatus>()
    for (const v of views) if (v.session) statusBySession.set(v.session.id, v.status)
    const out: Line[] = []
    for (const [sid, points] of positions) {
      const status = statusBySession.get(sid)
      if (!status) continue
      out.push({ id: sid, color: STATUS_META[status].color, points })
    }
    return out
  }, [positions, views])

  return (
    <div
      ref={containerRef}
      className={`relative flex-1 rounded-2xl border border-line bg-surface-2 p-3 sm:p-4 ${className}`}
    >
      {lines.length > 0 && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          {lines.map((l) => (
            <polyline
              key={l.id}
              points={l.points}
              fill="none"
              stroke={l.color}
              strokeWidth={2.5}
              strokeDasharray="7 6"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.6}
            />
          ))}
        </svg>
      )}
      <div className="relative grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4 sm:grid-cols-[repeat(auto-fill,minmax(138px,1fr))] sm:gap-5">
        {views.map((v) => (
          <Tile
            key={v.table.id}
            v={v}
            showWaiter={showWaiter}
            mine={!!highlightWaiterId && v.session?.waiter_id === highlightWaiterId}
            selected={selectedIds.includes(v.table.id)}
            onTap={onTap}
            onLongPress={onLongPress}
            setRef={setTileRef}
          />
        ))}
      </div>
    </div>
  )
}

interface TileProps {
  v: TileView
  showWaiter?: boolean
  mine: boolean
  selected: boolean
  onTap?: (v: TileView) => void
  onLongPress?: (v: TileView) => void
  setRef: (id: string, el: HTMLElement | null) => void
}

// Free tables (usually most of the floor) never change between ticks — a
// custom comparator lets React skip re-rendering them instead of doing a
// full reconciliation of 50+ tiles 4 times a minute. `onTap`/`onLongPress`
// are intentionally not compared: their *behavior* doesn't change even
// though the parent route re-creates the closures every render.
function tilesEqual(prev: TileProps, next: TileProps) {
  if (prev.showWaiter !== next.showWaiter) return false
  if (prev.mine !== next.mine) return false
  if (prev.selected !== next.selected) return false
  const a = prev.v
  const b = next.v
  return (
    a.table.id === b.table.id &&
    a.status === b.status &&
    a.elapsedMs === b.elapsedMs &&
    a.total === b.total &&
    (a.session?.covers ?? 0) === (b.session?.covers ?? 0) &&
    (a.waiter?.id ?? null) === (b.waiter?.id ?? null) &&
    (a.joinedLabels?.join('+') ?? null) === (b.joinedLabels?.join('+') ?? null)
  )
}

const Tile = memo(function Tile({
  v,
  showWaiter,
  mine,
  selected,
  onTap,
  onLongPress,
  setRef,
}: TileProps) {
  const t = useI18n((s) => s.t)
  const meta = STATUS_META[v.status]
  const free = v.status === 'free'
  const late = v.status === 'late'
  const vip = v.table.vip
  // Shape first: a waiter finds a table by recognising it in the room, so a
  // sofa bench should read as a bench and a round top as a circle. Tables
  // with no shape set fall back to sizing by seat count, which is how the
  // whole floor looked before shapes existed.
  const shape = v.table.shape ?? null
  const wide = shape === 'long' || (!shape && (vip || v.table.seats >= 6))
  const round = shape === 'round'
  const compact = !round && !wide && !vip && v.table.seats <= 2

  // long-press detection (join mode) — pointer events cover both touch & mouse
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fired = useRef(false)
  const start = () => {
    if (!onLongPress) return
    fired.current = false
    timer.current = setTimeout(() => {
      fired.current = true
      navigator.vibrate?.(30)
      onLongPress(v)
    }, 480)
  }
  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  return (
    <button
      ref={(el) => setRef(v.table.id, el)}
      onPointerDown={start}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onPointerMove={clear} // cancel long-press if the finger moves (scrolling)
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (fired.current) return
        onTap?.(v)
      }}
      aria-label={`${v.table.label} — ${t(meta.tkey)}`}
      className={`relative flex select-none flex-col gap-1.5 overflow-hidden border p-3 text-left shadow-(--shadow-1) transition-all duration-150 active:scale-[0.98] ${
        late ? 'late-pulse' : ''
      } ${
        round
          ? 'aspect-square items-center justify-center rounded-full text-center'
          : 'rounded-(--radius-card)'
      } ${wide ? 'col-span-2 min-h-[112px]' : compact ? 'min-h-[100px]' : 'min-h-[108px]'}`}
      style={{
        background: free ? 'var(--color-surface)' : meta.soft,
        borderColor: free
          ? 'var(--color-line-2)'
          : `color-mix(in srgb, ${meta.color} 40%, var(--color-line-2))`,
        outline: selected ? `3px solid var(--color-accent)` : 'none',
        outlineOffset: 2,
        touchAction: 'manipulation',
      }}
    >
      <span
        className="absolute inset-y-0 left-0 w-[4px]"
        style={{ background: free ? 'var(--color-line-2)' : meta.color }}
      />
      <span className="flex items-baseline justify-between gap-1">
        <span className={`font-extrabold tracking-tight ${vip ? 'text-[15px]' : 'text-[16px]'} truncate`}>
          {vip && <Crown size={13} className="mb-0.5 mr-1 inline text-amber-500" />}
          {v.joinedLabels ? v.joinedLabels.join('+') : v.table.label}
        </span>
        <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-semibold text-ink-3">
          <Users size={10} />
          {v.session ? v.session.covers : v.table.seats}
        </span>
      </span>
      <span
        className="text-[11px] leading-tight font-bold"
        style={{ color: free ? 'var(--color-ink-3)' : meta.color }}
      >
        {t(meta.tkey)}
      </span>
      {showWaiter && v.waiter && (
        <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-ink-2">
          <span className="size-2 shrink-0 rounded-full" style={{ background: v.waiter.color }} />
          <span className="truncate">{v.waiter.name}</span>
        </span>
      )}
      {!free && (
        <span className="mt-auto flex items-center justify-between gap-1">
          <span className="tnum text-[11.5px] font-bold">{v.total > 0 ? money(v.total) : ''}</span>
          <span className={`tnum text-[10.5px] font-semibold ${late ? 'text-st-late' : 'text-ink-3'}`}>
            {dur(v.elapsedMs)}
          </span>
        </span>
      )}
      {mine && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent" />}
    </button>
  )
}, tilesEqual)
