import { describe, expect, it } from 'vitest'
import { formatDay, formatDaysAgo } from './dates'

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
