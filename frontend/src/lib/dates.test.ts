import { describe, expect, it } from 'vitest'
import { formatBirthday, formatDay, formatDaysAgo, isoDay } from './dates'

describe('formatDay', () => {
  it('shows the calendar day from the API, whatever the time zone', () => {
    const shown = formatDay('2026-09-12')

    expect(shown).toMatch(/12/)
    expect(shown).toMatch(/2026/)
    expect(shown).not.toMatch(/11|13/)
  })
})

describe('formatDaysAgo', () => {
  const today = new Date(2026, 8, 23) // 23 Sep 2026, local time
  const english = (iso: string) => formatDaysAgo(iso, today)

  it.each([
    ['2026-09-23', /today/],
    ['2026-09-22', /yesterday/],
    ['2026-09-20', /3 days ago/],
    ['2026-09-13', /last week/],
    ['2026-09-02', /3 weeks ago/],
    ['2026-07-23', /2 months ago/],
    ['2025-09-01', /last year/],
    ['2023-01-01', /3 years ago/],
  ])('%s → %s', (iso, expected) => {
    expect(english(iso)).toMatch(expected)
  })
})

describe('isoDay', () => {
  it('writes local calendar days, counting back across months and years', () => {
    const today = new Date(2026, 0, 1, 23, 30) // late on 1 Jan 2026, local time

    expect(isoDay(0, today)).toBe('2026-01-01')
    expect(isoDay(1, today)).toBe('2025-12-31')
  })
})

describe('formatBirthday', () => {
  it('shows the day and month, and the year when known', () => {
    expect(formatBirthday({ day: 12, month: 3 })).toMatch(/12/)
    expect(formatBirthday({ day: 12, month: 3 })).not.toMatch(/2000/)
    expect(formatBirthday({ day: 12, month: 3, year: 1992 })).toMatch(/1992/)
  })

  it('keeps 29 February when the year is unknown', () => {
    expect(formatBirthday({ day: 29, month: 2 })).toMatch(/29/)
  })
})
