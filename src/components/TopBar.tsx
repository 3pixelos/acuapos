import { useState, type ReactNode } from 'react'
import { Languages, LogOut, Menu, WifiOff, X } from 'lucide-react'
import { useAuth } from '../state/auth'
import { PoweredBy } from './PoweredBy'
import { AcuaLogo } from './AcuaLogo'
import { useData } from '../state/data'
import { useI18n } from '../lib/i18n'

export interface NavTab {
  id: string
  label: string
  icon: React.ReactNode
  active: boolean
  onClick: () => void
}

export function TopBar({
  section,
  tabs,
  /** Slot rendered next to the title, on mobile AND desktop. The admin's
   * branch switcher lives here so it's reachable from every tab without
   * repeating a control down the page on a phone. */
  extra,
}: {
  section: string
  tabs?: NavTab[]
  extra?: ReactNode
}) {
  const { user, logout } = useAuth()
  const connected = useData((s) => s.connected)
  const { lang, setLang, t } = useI18n()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Menu"
              className="grid size-9 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-2 sm:hidden"
            >
              <Menu size={19} />
            </button>
            <AcuaLogo className="h-7 w-auto" />
            <span className="hidden h-7 w-px bg-line-2 sm:block" />
            <span className="hidden truncate text-xs font-bold tracking-[0.18em] text-ink-3 uppercase sm:inline">
              {section}
            </span>
            {extra && <span className="ml-1 min-w-0 shrink">{extra}</span>}
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            <button
              onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-bold text-ink-2 transition-colors hover:bg-surface-2"
              aria-label="Language"
            >
              <Languages size={14} />
              {lang === 'fr' ? 'FR' : 'EN'}
            </button>
            {user && (
              <div className="text-right leading-tight">
                <div className="text-sm font-bold">{user.name}</div>
                <div className="text-[11px] text-ink-3">{t(`role_${user.role}`)}</div>
              </div>
            )}
            {user?.role === 'waiter' && (
              <span className="size-2.5 rounded-full" style={{ background: user.color }} />
            )}
            <button
              onClick={logout}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-accent px-4 text-xs font-bold text-white transition-all active:translate-y-px"
            >
              <LogOut size={14} />
              {t('logout')}
            </button>
          </div>
        </div>
      </header>
      {!connected && (
        <div className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-1.5 text-xs font-semibold text-amber-800">
          <WifiOff size={13} /> {t('offline')}
        </div>
      )}
      {sidebarOpen && (
        <Sidebar section={section} tabs={tabs} onClose={() => setSidebarOpen(false)} />
      )}
    </>
  )
}

function Sidebar({
  section,
  tabs,
  onClose,
}: {
  section: string
  tabs?: NavTab[]
  onClose: () => void
}) {
  const { user, logout } = useAuth()
  const { lang, setLang, t } = useI18n()

  return (
    <div className="anim-fade fixed inset-0 z-40 flex bg-stone-900/45 backdrop-blur-[2px] sm:hidden" onClick={onClose}>
      <div
        className="anim-drawer flex h-full w-[82%] max-w-xs flex-col bg-surface shadow-(--shadow-3)"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="leading-none">
            <AcuaLogo className="h-7 w-auto" />
            <div className="mt-1 text-[10px] font-bold tracking-[0.2em] text-ink-3 uppercase">{section}</div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('close')}
            className="grid size-10 place-items-center rounded-full bg-surface-2 text-ink-2"
          >
            <X size={18} />
          </button>
        </div>

        {user && (
          <div className="flex items-center gap-3 border-b border-line px-5 py-4">
            {user.role === 'waiter' && (
              <span className="size-3 shrink-0 rounded-full" style={{ background: user.color }} />
            )}
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[15px] font-bold">{user.name}</div>
              <div className="text-xs text-ink-3">{t(`role_${user.role}`)}</div>
            </div>
          </div>
        )}

        {tabs && tabs.length > 0 && (
          <nav className="flex flex-col gap-1 border-b border-line px-3 py-3">
            {tabs.map((x) => (
              <button
                key={x.id}
                onClick={() => {
                  x.onClick()
                  onClose()
                }}
                className={`flex min-h-12 items-center gap-3 rounded-xl px-3.5 text-[14px] font-semibold transition-all ${
                  x.active ? 'bg-accent text-white' : 'text-ink-2 hover:bg-surface-2'
                }`}
              >
                {x.icon}
                {x.label}
              </button>
            ))}
          </nav>
        )}

        <div className="mt-auto flex flex-col gap-2 px-5 py-4">
          <button
            onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-line text-sm font-bold text-ink-2"
          >
            <Languages size={15} />
            {lang === 'fr' ? 'Français' : 'English'}
          </button>
          <button
            onClick={logout}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-accent text-sm font-bold text-white active:translate-y-px"
          >
            <LogOut size={15} />
            {t('logout')}
          </button>
          <PoweredBy className="mt-2 border-t border-line pt-3" />
        </div>
      </div>
    </div>
  )
}
