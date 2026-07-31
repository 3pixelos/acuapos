import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Branch, Role, Staff } from '../lib/types'

type SessionUser = Pick<Staff, 'id' | 'name' | 'username' | 'role' | 'color' | 'branch'>

export type LoginResult = 'ok' | 'bad' | 'busy'

interface AuthState {
  user: SessionUser | null
  sessionToken: string | null
  /** The secret this session logged in with — memory only, never
   * persisted. Lets the admin screen call RPCs that re-verify the admin's
   * password (e.g. reading staff PINs) without prompting again. */
  secret: string | null
  /** Set when the heartbeat detects this device was signed out elsewhere;
   * the login screen shows it once, then it's cleared. */
  kickedMessage: boolean
  /** True while a remembered admin session is being restored at startup —
   * the app shows a spinner instead of the login screen during this. */
  resuming: boolean
  /** `force` breaks a stale device lock (e.g. the old phone died without
   * logging out) — the other device is evicted on its next heartbeat. */
  loginPin: (pin: string, force?: boolean) => Promise<LoginResult>
  loginPassword: (username: string, password: string, force?: boolean) => Promise<LoginResult>
  /** Restore a remembered admin session at startup (no-op otherwise). */
  resumeAdmin: () => Promise<void>
  logout: () => void
  clearKicked: () => void
}

type LoginRow = {
  id: string
  name: string
  username: string
  role: Role
  color: string
  branch: Branch
  session_token: string | null
  denied: boolean
}

async function rpcLogin(username: string, secret: string, force = false): Promise<LoginRow | null> {
  const { data, error } = await supabase.rpc('staff_login', {
    p_username: username,
    p_secret: secret,
    p_force: force,
  })
  if (error || !data?.length) return null
  const row = data[0] as LoginRow
  // Single-location: every account resolves to the one 'main' branch.
  return { ...row, branch: row.branch ?? 'main' }
}

/** The branch a non-admin is locked to. Admins aren't scoped (they pick a
 * view per tab), so this is null for them and every scoped read must treat
 * null as "all branches". */
export function scopedBranch(): Branch | null {
  const u = useAuth.getState().user
  if (!u || u.role === 'admin') return null
  return u.branch
}

/* ------------------------------------------------------------------ *
 * Which location this DEVICE belongs to. Single-location, so this is  *
 * always 'main' — the plumbing is kept so the print service (which    *
 * starts on boot, before anyone signs in) still resolves a location   *
 * while logged out.                                                   *
 * ------------------------------------------------------------------ */
const DEVICE_BRANCH_KEY = 'acua.device.branch.v1'

function rememberDeviceBranch(b: Branch) {
  try {
    localStorage.setItem(DEVICE_BRANCH_KEY, b)
  } catch {
    /* ignore */
  }
}

/** This device's branch: the signed-in one, else the last one seen here.
 * Null only on a machine nobody has ever signed into. */
export function deviceBranch(): Branch | null {
  const scoped = scopedBranch()
  if (scoped) return scoped
  try {
    const raw = localStorage.getItem(DEVICE_BRANCH_KEY)
    if (raw === 'main') return raw
  } catch {
    /* ignore */
  }
  return null
}

/* ------------------------------------------------------------------ *
 * "Remember me" — admins only.                                        *
 * The admin device (which also carries push notifications) should not *
 * re-prompt for a password after closing/reopening. We stash the      *
 * admin's own credentials locally and silently re-login on startup.   *
 * Waiters/cashiers are never remembered. Logging out forgets it.      *
 * Note: local-only convenience on a trusted device — not encryption.  *
 * ------------------------------------------------------------------ */
const REMEMBER_KEY = 'acua.admin.remember.v1'
type Remembered = { username: string; secret: string }

function readRemember(): Remembered | null {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (o && typeof o.username === 'string' && typeof o.secret === 'string') return o
  } catch {
    /* ignore corrupt/unavailable storage */
  }
  return null
}
function saveRemember(r: Remembered) {
  try {
    localStorage.setItem(REMEMBER_KEY, JSON.stringify(r))
  } catch {
    /* ignore */
  }
}
function clearRemember() {
  try {
    localStorage.removeItem(REMEMBER_KEY)
  } catch {
    /* ignore */
  }
}
/** True when an admin session can be resumed without a password prompt. */
export function hasRememberedAdmin(): boolean {
  return readRemember() !== null
}

// No persistence for waiters/cashiers — closing or reloading lands them back
// on the login screen and frees the seat. Admins are the one exception (see
// the remember-me block above): `resuming` starts true so the app shows a
// spinner instead of flashing the login screen while we restore the session.
export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  sessionToken: null,
  secret: null,
  kickedMessage: false,
  resuming: hasRememberedAdmin(),

  loginPin: async (pin, force = false) => {
    const row = await rpcLogin('', pin, force)
    if (!row) return 'bad'
    if (row.denied) return 'busy'
    set({ user: row, sessionToken: row.session_token, secret: pin, kickedMessage: false })
    if (row.role !== 'admin') rememberDeviceBranch(row.branch)
    return 'ok'
  },

  loginPassword: async (username, password, force = false) => {
    const uname = username.trim().toLowerCase()
    const row = await rpcLogin(uname, password, force)
    if (!row) return 'bad'
    if (row.denied) return 'busy'
    set({ user: row, sessionToken: row.session_token, secret: password, kickedMessage: false })
    // Remember admins so they skip the password on the next launch.
    if (row.role === 'admin') saveRemember({ username: uname, secret: password })
    else rememberDeviceBranch(row.branch)
    return 'ok'
  },

  resumeAdmin: async () => {
    const r = readRemember()
    if (!r) return set({ resuming: false })
    // Reclaim our own device — force past a stale single-device lock left by
    // a previous close that didn't cleanly release the seat.
    const res = await get().loginPassword(r.username, r.secret, true)
    if (res !== 'ok') clearRemember() // password changed / account gone
    set({ resuming: false })
  },

  logout: () => {
    const { user, sessionToken } = get()
    clearRemember()
    set({ user: null, sessionToken: null, secret: null })
    // Drop the outgoing user's branch data so the next sign-in on this
    // device can't flash the wrong branch's floor. Imported lazily: data.ts
    // imports this module, so a static import would be circular.
    void import('./data').then(({ useData }) => useData.getState().reset())
    if (user && sessionToken) {
      // lazy builder: without .then() the request never fires and the
      // single-device seat stays taken until the heartbeat times out
      supabase
        .rpc('staff_logout', { p_staff_id: user.id, p_session_token: sessionToken })
        .then(({ error }) => {
          if (error) console.error('[logout] failed:', error)
        })
    }
  },

  clearKicked: () => set({ kickedMessage: false }),
}))

/** Best-effort logout on tab close — frees the seat immediately instead of
 * waiting out the heartbeat timeout. Uses keepalive so it survives unload. */
export function beaconLogout() {
  const { user, sessionToken } = useAuth.getState()
  if (!user || !sessionToken) return
  // A remembered admin keeps its seat across background/close so it can resume
  // without a password (and keep push alive) — don't release it here.
  if (user.role === 'admin' && hasRememberedAdmin()) return
  const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/staff_logout`
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  void fetch(url, {
    method: 'POST',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ p_staff_id: user.id, p_session_token: sessionToken }),
  }).catch(() => {})
}

const HEARTBEAT_MS = 15_000

/** Call once, high in the tree. Keeps this device's session alive and signs
 * it out the moment another device logs in as the same staff member. */
export function useSessionHeartbeat() {
  const user = useAuth((s) => s.user)
  const sessionToken = useAuth((s) => s.sessionToken)
  const boundOnce = useRef(false)

  useEffect(() => {
    if (boundOnce.current) return
    boundOnce.current = true
    window.addEventListener('pagehide', beaconLogout)
    return () => window.removeEventListener('pagehide', beaconLogout)
  }, [])

  useEffect(() => {
    if (!user || !sessionToken) return
    const beat = async () => {
      const { data } = await supabase.rpc('staff_heartbeat', {
        p_staff_id: user.id,
        p_session_token: sessionToken,
      })
      if (!data) {
        // Another device took over this account — sign this one out.
        useAuth.setState({ user: null, sessionToken: null, secret: null, kickedMessage: true })
        // ...and drop the cached data, exactly as logout() does. Without
        // this the store kept `ready: true`, so init() early-returned on the
        // NEXT sign-in and the app carried on with the previous user's floor
        // plan, whose table ids then got stamped onto real sessions.
        void import('./data').then(({ useData }) => useData.getState().reset())
      }
    }
    const id = setInterval(beat, HEARTBEAT_MS)
    return () => clearInterval(id)
  }, [user, sessionToken])
}
