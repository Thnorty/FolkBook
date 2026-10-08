import { describe, expect, it } from 'vitest'
import { swipeOf } from './swipe'

describe('swipeOf', () => {
  it.each([
    [130, 0, 'save'],
    [-130, 0, 'skip'],
    [40, 600, 'save'],
    [-40, -600, 'skip'],
    [40, 100, null],
    [-100, 0, null],
  ] as const)('a drag of %s px at %s px/s is %s', (offset, velocity, expected) => {
    expect(swipeOf(offset, velocity)).toBe(expected)
  })
})
