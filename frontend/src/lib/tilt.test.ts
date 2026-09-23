import { describe, expect, it } from 'vitest'
import { tilt } from './tilt'

describe('tilt', () => {
  it('gives the same angle for the same seed', () => {
    expect(tilt('emma', 4)).toBe(tilt('emma', 4))
  })

  it('stays within the limit and varies between seeds', () => {
    const angles = ['emma', 'oskar', 'ines', 'tom', 'Şükrü', 'yuki'].map((seed) => tilt(seed, 4))

    for (const angle of angles) expect(Math.abs(angle)).toBeLessThanOrEqual(4)
    expect(new Set(angles).size).toBeGreaterThan(1)
  })
})
