/**
 * The restaurant's day doesn't end at midnight — service runs into the
 * small hours, so a table closed at 04:30 belongs to the night that just
 * ended, not to the new calendar date. Everything date-based (analytics,
 * the sales report, the journal filter) goes through here so they agree.
 */
export const DAY_START_HOUR = 5

/** Start (05:00 local) of the service day the given moment belongs to. */
export function businessDayStart(d: Date): Date {
  const shifted = new Date(d.getTime() - DAY_START_HOUR * 3600_000)
  return new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate(), DAY_START_HOUR)
}

/** YYYY-MM-DD of the service day an ISO timestamp belongs to. */
export const localDay = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - DAY_START_HOUR * 3600_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/* ---------------- sales-report periods ---------------- */
export type ReportScope = 'day' | 'week' | 'month' | 'custom'

export interface ReportPeriod {
  scope: ReportScope
  /** Stable identifier: '2026-07-21' | '2026-W30' | '2026-07'. */
  key: string
  /** Human label for the receipt and the approval request. */
  label: string
  from: Date
  to: Date
}

const pad = (n: number) => String(n).padStart(2, '0')
const dm = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`

/** Monday 03:00 of the service week containing `d`. */
function weekStart(d: Date): Date {
  const s = businessDayStart(d)
  const dow = (s.getDay() + 6) % 7 // Monday = 0
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() - dow, DAY_START_HOUR)
}

/** ISO-ish week key (year + week number), good enough as a unique id. */
function weekKey(start: Date): string {
  const jan1 = new Date(start.getFullYear(), 0, 1)
  const week = Math.floor((start.getTime() - jan1.getTime()) / (7 * 86400_000)) + 1
  return `${start.getFullYear()}-W${pad(week)}`
}

/** The service day containing `date` (a YYYY-MM-DD string). */
export function dayPeriod(date: string): ReportPeriod {
  const [y, m, d] = date.split('-').map(Number)
  const from = new Date(y, m - 1, d, DAY_START_HOUR)
  const to = new Date(y, m - 1, d + 1, DAY_START_HOUR)
  return { scope: 'day', key: date, label: `${pad(d)}/${pad(m)}/${y}`, from, to }
}

function weekPeriod(start: Date): ReportPeriod {
  const to = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7, DAY_START_HOUR)
  const lastDay = new Date(to.getTime() - 86400_000)
  return {
    scope: 'week',
    key: weekKey(start),
    label: `${dm(start)} → ${dm(lastDay)}`,
    from: start,
    to,
  }
}

function monthPeriod(y: number, m: number): ReportPeriod {
  const from = new Date(y, m, 1, DAY_START_HOUR)
  const to = new Date(y, m + 1, 1, DAY_START_HOUR)
  return { scope: 'month', key: `${y}-${pad(m + 1)}`, label: `${pad(m + 1)}/${y}`, from, to }
}

/** A custom span between two YYYY-MM-DD dates (both inclusive), aligned to
 * the 05:00 service-day boundary. */
export function rangePeriod(fromStr: string, toStr: string): ReportPeriod {
  const [a, b] = fromStr <= toStr ? [fromStr, toStr] : [toStr, fromStr]
  const [fy, fm, fd] = a.split('-').map(Number)
  const [ty, tm, td] = b.split('-').map(Number)
  const from = new Date(fy, fm - 1, fd, DAY_START_HOUR)
  const to = new Date(ty, tm - 1, td + 1, DAY_START_HOUR) // +1 day -> inclusive end
  return { scope: 'custom', key: `${a}_${b}`, label: `${dm(from)} → ${pad(td)}/${pad(tm)}`, from, to }
}

/**
 * Weeks that have fully ENDED (the report is a closing document, so a
 * half-finished week can't be printed). Most recent first.
 */
export function completedWeeks(now = new Date(), count = 8): ReportPeriod[] {
  const thisWeek = weekStart(now)
  return Array.from({ length: count }, (_, i) => {
    const s = new Date(thisWeek)
    s.setDate(s.getDate() - 7 * (i + 1))
    return weekPeriod(s)
  })
}

/** Months that have fully ended, most recent first. */
export function completedMonths(now = new Date(), count = 12): ReportPeriod[] {
  const anchor = businessDayStart(now)
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() - (i + 1), 1)
    return monthPeriod(d.getFullYear(), d.getMonth())
  })
}

/** Service days available to print: today (partial) and the past. */
export function todayKey(now = new Date()): string {
  return ymd(businessDayStart(now))
}
