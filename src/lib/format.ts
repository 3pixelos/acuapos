export const money = (n: number) =>
  Number(n || 0).toLocaleString('fr-MA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' DH'

/** Compact duration: "45 s", "12 min", "1 h 05". */
export function dur(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
}

export const clock = (t: string | number) =>
  new Date(t).toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })

export const dateLabel = (t: string | number, lang: string) =>
  new Date(t).toLocaleDateString(lang === 'fr' ? 'fr-MA' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
