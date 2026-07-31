import { useEffect } from 'react'
import { useAuth, useSessionHeartbeat } from './state/auth'
import { useData } from './state/data'
import { useI18n } from './lib/i18n'
import { useKitchenPrintService } from './lib/kitchenPrintService'
import { usePrinter } from './state/printer'
import { deviceBranch } from './state/auth'
import { useAutoUpdate } from './lib/autoUpdate'
import { Login } from './routes/Login'
import { WaiterHome } from './routes/WaiterHome'
import { CaisseHome } from './routes/CaisseHome'
import { AdminHome } from './routes/AdminHome'

// One device = one logged-in employee; the role decides the interface.
export default function App() {
  const user = useAuth((s) => s.user)
  const resuming = useAuth((s) => s.resuming)
  const resumeAdmin = useAuth((s) => s.resumeAdmin)
  const { ready, init } = useData()
  const t = useI18n((s) => s.t)

  useSessionHeartbeat()
  // Restore a remembered admin session on launch (no-op for everyone else).
  useEffect(() => {
    void resumeAdmin()
  }, [resumeAdmin])
  // Phones that cached an old bundle (installed PWA) reload themselves as
  // soon as a newer build is deployed — fixes "works on PC, not on mobile".
  useAutoUpdate()
  // Silent kitchen printing runs in the background of the Caisse desktop app
  // from the moment it launches — before login, on every screen. No-op in a
  // browser / on the waiter's phone.
  useKitchenPrintService()

  useEffect(() => {
    if (user) void init()
  }, [user, init])

  // Load the location's printer set. Falls back to the device's last-seen
  // location while logged out (the print service runs before login and needs
  // the right targets).
  const loadPrinters = usePrinter((s) => s.loadForBranch)
  useEffect(() => {
    loadPrinters(user?.branch ?? deviceBranch())
  }, [user?.branch, loadPrinters])

  // Keep the push service worker registered/fresh for admins so cancellation
  // and print-request notifications arrive even when the app is closed.
  useEffect(() => {
    if (user?.role === 'admin' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [user])

  if (!user && resuming)
    return (
      <div className="grid min-h-dvh place-items-center text-sm font-semibold text-ink-3">
        {t('loading')}
      </div>
    )
  if (!user) return <Login />
  if (!ready)
    return (
      <div className="grid min-h-dvh place-items-center text-sm font-semibold text-ink-3">
        {t('loading')}
      </div>
    )
  if (user.role === 'cashier') return <CaisseHome />
  if (user.role === 'admin') return <AdminHome />
  return <WaiterHome />
}
