import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import type { Branch, LayerId, Role, TableStatus } from '../lib/types'
import { layersForRole } from '../lib/types'
import { useI18n, type TKey } from '../lib/i18n'

export const LAYER_TKEY: Record<LayerId, TKey> = {
  frontdoor: 'layer_frontdoor',
  salon: 'layer_salon',
  terrasse: 'layer_terrasse',
  bar: 'layer_bar',
  emporter: 'layer_emporter',
}

/** Rooms a role may switch between, as switcher entries. */
export const layersFor = (branch: Branch, role: Role): { id: LayerId; tkey: TKey }[] =>
  layersForRole(branch, role).map((id) => ({ id, tkey: LAYER_TKEY[id] }))

export function LayerSwitcher({
  layer,
  setLayer,
  /** Which location's rooms to offer. */
  branch = 'main',
  /** Whose room list to show — waiters don't get À emporter. */
  role,
}: {
  layer: LayerId
  setLayer: (l: LayerId) => void
  branch?: Branch
  role: Role
}) {
  const t = useI18n((s) => s.t)
  return (
    <div className="flex rounded-full bg-surface-2 p-1">
      {layersFor(branch, role).map((l) => (
        <button
          key={l.id}
          onClick={() => setLayer(l.id)}
          // `min-w-0` + `truncate` let a pill shrink below its label. Without
          // them a flex child refuses to go under its content width, so on a
          // phone the row grew wider than the screen and dragged the whole
          // page sideways with it — five rooms already overflow a 375px
          // screen in every language.
          className={`min-h-9 min-w-0 flex-1 truncate rounded-full px-2 text-[13px] font-semibold transition-all sm:flex-none sm:px-4 ${
            layer === l.id ? 'bg-surface text-ink shadow-(--shadow-1)' : 'text-ink-3'
          }`}
        >
          {t(l.tkey)}
        </button>
      ))}
    </div>
  )
}

/* ---------- status meta ---------- */
export const STATUS_META: Record<
  TableStatus,
  { tkey: TKey; color: string; soft: string }
> = {
  free: { tkey: 'st_free', color: '#78716C', soft: '#FFFFFF' },
  waiting: { tkey: 'st_waiting', color: 'var(--color-st-waiting)', soft: 'var(--color-st-waiting-soft)' },
  preparing: { tkey: 'st_preparing', color: 'var(--color-st-preparing)', soft: 'var(--color-st-preparing-soft)' },
  served: { tkey: 'st_served', color: 'var(--color-st-served)', soft: 'var(--color-st-served-soft)' },
  late: { tkey: 'st_late', color: 'var(--color-st-late)', soft: 'var(--color-st-late-soft)' },
  closed: { tkey: 'st_closed', color: '#475569', soft: '#E2E8F0' },
  cancel_pending: { tkey: 'st_cancel_pending', color: '#DC2626', soft: '#FEE2E2' },
}

export function Legend({ statuses }: { statuses?: TableStatus[] }) {
  const t = useI18n((s) => s.t)
  const keys =
    statuses ??
    (['free', 'waiting', 'preparing', 'served', 'late', 'closed', 'cancel_pending'] as TableStatus[])
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-1">
      {keys.map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2">
          <span className="size-2.5 rounded-full" style={{ background: STATUS_META[k].color }} />
          {t(STATUS_META[k].tkey)}
        </span>
      ))}
    </div>
  )
}

/* ---------- buttons ---------- */
export function Btn({
  children,
  onClick,
  variant = 'outline',
  disabled,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'outline' | 'success' | 'danger' | 'ghost'
  disabled?: boolean
  className?: string
}) {
  const styles = {
    primary: 'bg-accent text-white border-accent hover:bg-stone-800',
    outline: 'bg-surface text-ink border-line-2 hover:bg-surface-2',
    success: 'bg-st-served text-white border-transparent hover:brightness-105',
    danger: 'bg-surface text-danger border-line-2 hover:bg-red-50',
    ghost: 'bg-transparent text-ink-2 border-transparent hover:bg-surface-2',
  }[variant]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`min-h-11 rounded-xl border px-4 text-sm font-semibold transition-all duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  )
}

/* ---------- overlays ---------- */
export function Scrim({ onClose, children, center }: { onClose: () => void; children: ReactNode; center?: boolean }) {
  return (
    <div
      className={`anim-fade fixed inset-0 z-40 flex bg-stone-900/45 backdrop-blur-[2px] ${
        center ? 'items-center justify-center p-4' : 'justify-end'
      }`}
      onClick={onClose}
    >
      {children}
    </div>
  )
}

export function Drawer({
  title,
  subtitle,
  onClose,
  children,
  footer,
  badge,
}: {
  title: ReactNode
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  badge?: ReactNode
}) {
  return (
    <Scrim onClose={onClose}>
      <div
        className="anim-drawer flex h-full w-full max-w-xl flex-col bg-surface shadow-(--shadow-3) max-sm:anim-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
              {title}
              {badge}
            </div>
            {subtitle && <div className="mt-0.5 text-[13px] text-ink-3">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2 transition-colors hover:bg-line"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-line bg-surface-2 px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </Scrim>
  )
}

export function Modal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <Scrim onClose={onClose} center>
      <div
        className="anim-sheet w-full max-w-sm rounded-2xl bg-surface p-6 shadow-(--shadow-3)"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </Scrim>
  )
}

export function StatusChip({ status }: { status: TableStatus }) {
  const t = useI18n((s) => s.t)
  const m = STATUS_META[status]
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase"
      style={{ background: m.soft, color: m.color, border: `1px solid color-mix(in srgb, ${m.color} 25%, transparent)` }}
    >
      {t(m.tkey)}
    </span>
  )
}
