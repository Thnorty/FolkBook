import { describe, expect, it } from 'vitest'
import { flyOffset } from './flyOffset'

describe('flyOffset', () => {
  it('moves centre onto centre and scales by height', () => {
    const card = { left: 100, top: 300, width: 44, height: 44 }
    const panel = { left: 900, top: 100, width: 112, height: 140 }
    // Card centre (122, 322), panel centre (956, 170).

    expect(flyOffset(card, panel)).toEqual({ x: 122 - 956, y: 322 - 170, scale: 44 / 140 })
  })

  it('does nothing until the target has a size', () => {
    expect(
      flyOffset(
        { left: 0, top: 0, width: 10, height: 10 },
        { left: 0, top: 0, width: 0, height: 0 },
      ),
    ).toBeNull()
  })
})
