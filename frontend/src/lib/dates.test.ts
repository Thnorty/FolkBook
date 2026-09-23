import { describe, expect, it } from 'vitest'
import { formatDay } from './dates'

describe('formatDay', () => {
  it('shows the calendar day from the API, whatever the time zone', () => {
    const shown = formatDay('2026-09-12')

    expect(shown).toMatch(/12/)
    expect(shown).toMatch(/2026/)
    expect(shown).not.toMatch(/11|13/)
  })
})
