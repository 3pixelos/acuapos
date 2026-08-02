import { useMemo, useRef, useState } from 'react'
import { Link2, Lock } from 'lucide-react'
import { TopBar } from '../components/TopBar'
import { buildTileViews, FloorMap, useNow, type TileView } from '../components/FloorMap'
import { Btn, LayerSwitcher, Legend, Modal } from '../components/ui'
import { OrderDrawer, SeatModal, ViewOnlyDrawer } from '../components/order'
import { useAuth } from '../state/auth'
import { useData } from '../state/data'
import { joinTablesMulti, seatTable } from '../state/actions'
import { useI18n } from '../lib/i18n'
import type { LayerId, TableSession } from '../lib/types'
import { labelsFor, layersForRole } from '../lib/types'

export function WaiterHome() {
  const user = useAuth((s) => s.user)!
  const { tables, sessions, items, staff } = useData()
  const now = useNow()
  const t = useI18n((s) => s.t)
  // First room of the location.
  const [layer, setLayer] = useState<LayerId>(layersForRole(user.branch, user.role)[0])

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

  const [seatFor, setSeatFor] = useState<string[] | null>(null) // table ids awaiting covers
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)
  const [joinSel, setJoinSel] = useState<string[] | null>(null) // tables selected to join
  // FloorMap tiles are memoized and deliberately keep stale onTap closures,
  // so onTap must read the join selection through a ref — reading `joinSel`
  // directly made taps on unselected tiles run the "not in join mode" branch.
  const joinSelRef = useRef(joinSel)
  joinSelRef.current = joinSel
  const [closedMsg, setClosedMsg] = useState(false)
  // A colleague's table opened for VIEWING only — no take-over, no editing.
  const [viewSessionId, setViewSessionId] = useState<string | null>(null)

  // Requiring waiter_id === user.id keeps a waiter out of the EDITABLE drawer
  // of any table they didn't claim — that's now the rule (only the claimer, or
  // the caisse, can add/change anything). A colleague's table opens view-only.
  const openSession =
    sessions.find((s) => s.id === openSessionId && !s.closed_at && s.waiter_id === user.id) ?? null
  const viewSession = sessions.find((s) => s.id === viewSessionId && !s.closed_at) ?? null

  const maxCoversFor = (ids: string[]) =>
    ids.reduce((n, id) => n + (tables.find((tb) => tb.id === id)?.seats ?? 0), 0)

  const onTap = (v: TileView) => {
    if (joinSelRef.current) {
      // toggle this table in/out of the join selection
      setJoinSel((sel) => {
        const next = sel!.includes(v.table.id)
          ? sel!.filter((x) => x !== v.table.id)
          : [...sel!, v.table.id]
        return next.length ? next : null
      })
      return
    }
    if (!v.session) return setSeatFor([v.table.id])
    if (v.session.locked) return setClosedMsg(true) // bill printed — ask the till
    if (v.session.waiter_id === user.id) return setOpenSessionId(v.session.id)
    // A colleague claimed it — you can look, but you can't touch. Only the
    // waiter who claimed the table (or the caisse) can add/change anything.
    setViewSessionId(v.session.id)
  }

  const confirmJoin = async () => {
    if (!joinSel || joinSel.length < 2) return
    const selTiles = views.filter((v) => joinSel.includes(v.table.id))
    const setJoin = joinSel
    setJoinSel(null)
    // distinct sessions among the selection
    const sessMap = new Map<string, TableSession>()
    for (const tile of selTiles) if (tile.session) sessMap.set(tile.session.id, tile.session)
    const distinctSessions = [...sessMap.values()]
    const freeIds = selTiles.filter((v) => !v.session).map((v) => v.table.id)

    if (distinctSessions.length === 0) {
      setSeatFor(setJoin) // all free -> seat together
      return
    }
    // target = earliest-seated session; merge the rest + free tables into it
    const [target, ...others] = distinctSessions.sort(
      (a, b) => new Date(a.seated_at).getTime() - new Date(b.seated_at).getTime(),
    )
    await joinTablesMulti(target, others, freeIds)
    setOpenSessionId(target.id)
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar section={t('roomMap')} />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-3 px-4 py-4">
        <LayerSwitcher layer={layer} setLayer={setLayer} branch={user.branch} role={user.role} />
        <div className="flex items-center justify-between gap-3">
          <Legend />
          {/* button alternative to the long-press — same join mode */}
          {!joinSel && (
            <Btn className="shrink-0" onClick={() => setJoinSel([])}>
              <span className="inline-flex items-center gap-1.5">
                <Link2 size={15} /> {t('joinSelected')}
              </span>
            </Btn>
          )}
        </div>
        {joinSel && (
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
        <FloorMap
          views={views}
          showWaiter
          highlightWaiterId={user.id}
          selectedIds={joinSel ?? []}
          onTap={onTap}
          onLongPress={(v) => setJoinSel((sel) => sel ?? [v.table.id])}
        />
      </main>

      {seatFor && (
        <SeatModal
          labels={seatFor.map((id) => tables.find((tb) => tb.id === id)?.label ?? id)}
          maxCovers={maxCoversFor(seatFor)}
          onClose={() => setSeatFor(null)}
          onSeat={async (covers) => {
            // adopts an existing open session if the table already has one
            // (guards against a duplicate when the floor briefly looked free)
            const s = await seatTable(seatFor, user.id, covers)
            setSeatFor(null)
            setOpenSessionId(s.id)
          }}
        />
      )}

      {closedMsg && (
        <Modal onClose={() => setClosedMsg(false)}>
          <div className="flex flex-col items-center text-center">
            <div className="grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-600">
              <Lock size={22} />
            </div>
            <h2 className="mt-3 text-lg font-bold">{t('tableClosedTitle')}</h2>
            <p className="mt-2 text-sm text-ink-2">{t('tableClosedMsg')}</p>
            <Btn variant="primary" className="mt-5 w-full" onClick={() => setClosedMsg(false)}>
              {t('close')}
            </Btn>
          </div>
        </Modal>
      )}

      {openSession && (
        <OrderDrawer key={openSession.id} session={openSession} onClose={() => setOpenSessionId(null)} />
      )}

      {viewSession && (
        <ViewOnlyDrawer
          key={`v-${viewSession.id}`}
          session={viewSession}
          onClose={() => setViewSessionId(null)}
        />
      )}
    </div>
  )
}
