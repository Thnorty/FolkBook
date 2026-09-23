const dayFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  // API dates ("2026-09-12") are calendar days, not moments: don't shift them by time zone.
  timeZone: 'UTC',
})

/** A calendar day from the API ("2026-09-12") in the user's locale, e.g. "12 Sep 2026". */
export function formatDay(isoDate: string): string {
  return dayFormat.format(new Date(`${isoDate}T00:00:00Z`))
}

const DAY = 24 * 60 * 60 * 1000
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

/** How long ago a calendar day was, e.g. "yesterday", "3 weeks ago", "last year". */
export function formatDaysAgo(isoDate: string, today: Date = new Date()): string {
  const then = Date.UTC(...ymd(isoDate))
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const days = Math.round((now - then) / DAY)
  if (days < 7) return relative.format(-days, 'day')
  if (days < 30) return relative.format(-Math.floor(days / 7), 'week')
  if (days < 365) return relative.format(-Math.floor(days / 30), 'month')
  return relative.format(-Math.floor(days / 365), 'year')
}

function ymd(isoDate: string): [number, number, number] {
  const [year, month, day] = isoDate.split('-').map(Number)
  return [year, month - 1, day]
}
