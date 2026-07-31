import { useEffect } from 'react'

/**
 * Stale-bundle watchdog. Waiter phones — above all the ones that pinned the
 * app to the home screen as a PWA — keep serving an old cached bundle long
 * after a new version is deployed, so fixes "work on the PC but not on
 * mobile". This hook compares the build id baked into the running bundle
 * against the freshly-deployed /version.json (fetched with cache bypassed)
 * and hard-reloads the moment they differ: when the phone comes back to the
 * foreground, and every few minutes while open.
 *
 * No-op in dev (no baked id) and in the Tauri desktop app (bundled files,
 * nothing to go stale).
 */
export function useAutoUpdate() {
  useEffect(() => {
    const current = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : null
    if (!current || import.meta.env.DEV) return
    if (location.protocol === 'tauri:' || location.hostname === 'tauri.localhost') return

    let checking = false
    const check = async () => {
      if (checking) return
      checking = true
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (res.ok) {
          const { v } = (await res.json()) as { v?: string }
          if (v && v !== current) location.reload()
        }
      } catch {
        /* offline — try again later */
      } finally {
        checking = false
      }
    }

    const onVisible = () => document.visibilityState === 'visible' && void check()
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(check, 5 * 60_000)
    void check()
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [])
}
