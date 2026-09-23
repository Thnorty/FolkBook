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
