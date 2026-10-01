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

/** The calendar day `daysBack` days before `today`, where the user is, as the API writes it. */
export function isoDay(daysBack = 0, today: Date = new Date()): string {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysBack)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
}

function ymd(isoDate: string): [number, number, number] {
  const [year, month, day] = isoDate.split('-').map(Number)
  return [year, month - 1, day]
}

const birthdayFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})
const birthdayWithYear = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/** "12 March", or "12 March 1992" when the year is known. */
export function formatBirthday({
  day,
  month,
  year,
}: {
  day: number
  month: number
  year?: number | null
}) {
  // Year 2000 is a leap year, so 29 February still formats when the year is unknown.
  const date = new Date(Date.UTC(year ?? 2000, month - 1, day))
  return (year ? birthdayWithYear : birthdayFormat).format(date)
}
