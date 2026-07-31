import { useState } from 'react'
import { AlertTriangle, Delete, HelpCircle, KeyRound, Languages, Mail, Monitor, Phone, X } from 'lucide-react'
import { useAuth } from '../state/auth'
import { PoweredBy } from '../components/PoweredBy'
import { AcuaLogo } from '../components/AcuaLogo'
import { useI18n } from '../lib/i18n'

/** Support contacts, most reachable first: the two lines that take both a
 * call and WhatsApp, then the call-only line, then the WhatsApp-only one.
 * `wa` is the number in international digits (no +/spaces) as wa.me needs
 * it — null when the line isn't on WhatsApp. */
const CONTACT = {
  phones: [
    { name: 'Mehdi', display: '+212 682 07 86 20', wa: '212682078620', call: true },
    { name: 'Anas', display: '+212 679 99 91 70', wa: '212679999170', call: true },
    { name: 'Adam', display: '+212 637 40 83 02', wa: null, call: true },
    { display: '+44 7346 381763', wa: '447346381763', call: false },
  ] as { name?: string; display: string; wa: string | null; call: boolean }[],
  email: '2amstudio.contact@gmail.com',
}

export function Login() {
  const [mode, setMode] = useState<'pin' | 'password'>('pin')
  const [helpOpen, setHelpOpen] = useState(false)
  const { lang, setLang, t } = useI18n()
  const kickedMessage = useAuth((s) => s.kickedMessage)
  const clearKicked = useAuth((s) => s.clearKicked)

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-bg p-6">
      <button
        onClick={() => setHelpOpen(true)}
        className="absolute top-4 left-4 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-xs font-bold text-ink-2"
      >
        <HelpCircle size={14} />
        {t('helpContact')}
      </button>
      <button
        onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
        className="absolute top-4 right-4 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-xs font-bold text-ink-2"
      >
        <Languages size={14} />
        {lang === 'fr' ? 'Français' : 'English'}
      </button>

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

      <div className="text-center">
        <AcuaLogo withTagline className="mx-auto h-28 w-auto" />
      </div>

      {kickedMessage && (
        <div className="anim-fade flex w-full max-w-90 items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-800">
          <AlertTriangle size={16} className="mt-px shrink-0" />
          <span className="flex-1">{t('kickedMessage')}</span>
          <button onClick={clearKicked} className="shrink-0 text-amber-700/70">
            ✕
          </button>
        </div>
      )}

      <div className="w-full max-w-90 rounded-3xl border border-line bg-surface p-7 shadow-(--shadow-2)">
        <div className="mb-6 flex rounded-full bg-surface-2 p-1">
          <ModeTab active={mode === 'pin'} onClick={() => setMode('pin')} icon={<KeyRound size={14} />}>
            {t('loginWaiter')}
          </ModeTab>
          <ModeTab active={mode === 'password'} onClick={() => setMode('password')} icon={<Monitor size={14} />}>
            {t('loginStaff')}
          </ModeTab>
        </div>
        {mode === 'pin' ? <PinPad /> : <PasswordForm />}
      </div>

      <PoweredBy className="mt-1" />
    </div>
  )
}

function HelpModal({ onClose }: { onClose: () => void }) {
  const t = useI18n((s) => s.t)
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={onClose}
    >
      <div
        className="anim-fade w-full max-w-90 rounded-3xl border border-line bg-surface p-6 shadow-(--shadow-2)"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">{t('contactTitle')}</h2>
            <p className="mt-1 text-[13px] text-ink-3">{t('contactHint')}</p>
          </div>
          <button onClick={onClose} className="grid size-8 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-2">
            <X size={18} />
          </button>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {CONTACT.phones.map((p) => (
            <div
              key={p.display}
              className="rounded-xl border border-line-2 bg-surface-2 px-3.5 py-2.5"
            >
              <div className="flex items-center gap-2">
                <Phone size={15} className="shrink-0 text-accent" />
                {p.name && <span className="text-[15px] font-bold">{p.name}</span>}
                <span className="tnum text-[13.5px] font-semibold text-ink-2">{p.display}</span>
              </div>
              <div className="mt-2 flex gap-2">
                {p.call && (
                  <a
                    href={`tel:${p.display.replace(/\s/g, '')}`}
                    className="flex-1 rounded-full bg-surface py-2 text-center text-[11.5px] font-bold text-ink-2 uppercase transition-all active:scale-95"
                  >
                    {t('callUs')}
                  </a>
                )}
                {p.wa && (
                  <a
                    href={`https://wa.me/${p.wa}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 rounded-full bg-[#25D366] py-2 text-center text-[11.5px] font-bold text-white uppercase transition-all active:scale-95"
                  >
                    WhatsApp
                  </a>
                )}
              </div>
            </div>
          ))}
          <a
            href={`mailto:${CONTACT.email}`}
            className="flex items-center gap-3 rounded-xl border border-line-2 bg-surface-2 px-3.5 py-3 text-[15px] font-semibold transition-all active:scale-[0.99]"
          >
            <Mail size={16} className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1 truncate">{CONTACT.email}</span>
            <span className="text-[11px] font-bold text-ink-3 uppercase">{t('emailUs')}</span>
          </a>
        </div>
      </div>
    </div>
  )
}

function ModeTab({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-[12.5px] font-bold transition-all duration-150 ${
        active ? 'bg-surface text-ink shadow-(--shadow-1)' : 'text-ink-3'
      }`}
    >
      {icon}
      {children}
    </button>
  )
}

function PinPad() {
  const [pin, setPin] = useState('')
  const [err, setErr] = useState<'bad' | 'busy' | null>(null)
  const [busy, setBusy] = useState(false)
  const loginPin = useAuth((s) => s.loginPin)
  const t = useI18n((s) => s.t)

  const push = (d: string) => {
    setErr(null)
    setPin((p) => (p.length < 4 ? p + d : p))
  }
  const submit = async (force = false) => {
    setBusy(true)
    const result = await loginPin(pin, force)
    setBusy(false)
    if (result !== 'ok') {
      setErr(result)
      // keep the PIN on "busy" so "force login" can reuse it in one tap
      if (result !== 'busy') setPin('')
    }
  }

  return (
    <div>
      <p className="mb-4 text-center text-[13px] text-ink-3">{t('enterPin')}</p>
      <div className="mb-5 flex justify-center gap-3" aria-label="PIN">
        {Array.from({ length: 4 }).map((_, i) => (
          <span
            key={i}
            className={`size-3.5 rounded-full border-2 transition-all duration-150 ${
              i < pin.length ? 'border-accent bg-accent' : 'border-line-2'
            }`}
          />
        ))}
      </div>
      {err && (
        <p className="mb-3 text-center text-[13px] font-semibold text-danger">
          {t(err === 'busy' ? 'alreadyActive' : 'badPin')}
        </p>
      )}
      {err === 'busy' && (
        <button
          onClick={() => submit(true)}
          disabled={busy || pin.length < 4}
          className="mb-3 w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13.5px] font-bold text-amber-800 transition-all active:translate-y-px disabled:opacity-40"
        >
          {t('forceLogin')}
          <span className="block text-[11.5px] font-medium">{t('forceLoginHint')}</span>
        </button>
      )}
      <div className="grid grid-cols-3 gap-2.5">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
          <Key key={n} onClick={() => push(n)}>{n}</Key>
        ))}
        <Key onClick={() => setPin((p) => p.slice(0, -1))} muted>
          <Delete size={20} />
        </Key>
        <Key onClick={() => push('0')}>0</Key>
        <button
          onClick={() => submit()}
          disabled={pin.length < 4 || busy}
          className="h-14 rounded-xl bg-accent text-[15px] font-bold text-white transition-all active:translate-y-px disabled:opacity-35"
        >
          OK
        </button>
      </div>
    </div>
  )
}

function Key({ children, onClick, muted }: { children: React.ReactNode; onClick: () => void; muted?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`grid h-14 place-items-center rounded-xl border border-line bg-surface-2 text-xl font-semibold transition-all active:translate-y-0.5 ${
        muted ? 'text-ink-3' : ''
      }`}
    >
      {children}
    </button>
  )
}

function PasswordForm() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<'bad' | 'busy' | null>(null)
  const [busy, setBusy] = useState(false)
  const loginPassword = useAuth((s) => s.loginPassword)
  const t = useI18n((s) => s.t)

  const submit = async (e: React.FormEvent | null, force = false) => {
    e?.preventDefault()
    setBusy(true)
    const result = await loginPassword(username, password, force)
    setBusy(false)
    if (result !== 'ok') setErr(result)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="block">
        <span className="mb-1.5 block text-xs font-bold text-ink-2">{t('username')}</span>
        <input
          value={username}
          onChange={(e) => {
            setErr(null)
            setUsername(e.target.value)
          }}
          autoComplete="username"
          autoCapitalize="none"
          required
          className="min-h-12 w-full rounded-xl border border-line-2 bg-surface-2 px-3.5 text-[15px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-bold text-ink-2">{t('password')}</span>
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setErr(null)
            setPassword(e.target.value)
          }}
          autoComplete="current-password"
          required
          className="min-h-12 w-full rounded-xl border border-line-2 bg-surface-2 px-3.5 text-[15px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
        />
      </label>
      {err && (
        <p className="text-center text-[13px] font-semibold text-danger">
          {t(err === 'busy' ? 'alreadyActive' : 'badCredentials')}
        </p>
      )}
      {err === 'busy' && (
        <button
          type="button"
          onClick={() => submit(null, true)}
          disabled={busy || !username || !password}
          className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13.5px] font-bold text-amber-800 transition-all active:translate-y-px disabled:opacity-40"
        >
          {t('forceLogin')}
          <span className="block text-[11.5px] font-medium">{t('forceLoginHint')}</span>
        </button>
      )}
      <button
        type="submit"
        disabled={busy || !username || !password}
        className="min-h-12 rounded-xl bg-accent text-[15px] font-bold text-white transition-all active:translate-y-px disabled:opacity-35"
      >
        {t('signIn')}
      </button>
    </form>
  )
}
