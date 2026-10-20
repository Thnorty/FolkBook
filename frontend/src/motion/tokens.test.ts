/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { spring } from 'motion'
import { describe, expect, it } from 'vitest'
import { DURATION, EASE, LIMITS, STICK_SPRING } from './tokens'

/** How long a spring takes to come to rest, in seconds. */
function settleTime({ stiffness, damping }: typeof STICK_SPRING): number {
  const generator = spring({ keyframes: [0, 1], stiffness, damping })
  let ms = 0
  while (!generator.next(ms).done) ms += 10
  return ms / 1000
}

describe('motion tokens', () => {
  it('keep UI transitions within 450ms and decorative effects within 700ms', () => {
    const { ink, ...ui } = DURATION
    for (const duration of Object.values(ui)) expect(duration).toBeLessThanOrEqual(LIMITS.ui)
    expect(ink).toBeLessThanOrEqual(LIMITS.decorative)
  })

  it('let a sticky note come to rest within the decorative limit', () => {
    expect(settleTime(STICK_SPRING)).toBeLessThanOrEqual(LIMITS.decorative)
  })

  it('give dialogs the same exit time in CSS as in the code that waits for it', () => {
    const css = readFileSync('src/index.css', 'utf8')
    const exit = css.match(/--animate-sheet-down: sheet-down (\d+)ms/)?.[1]

    expect(Number(exit)).toBe(DURATION.dialogOut * 1000)
  })

  it('use the same ease in CSS as in Motion', () => {
    const css = readFileSync('src/index.css', 'utf8')
    const ease = css.match(/--ease-notebook: cubic-bezier\(([^)]+)\)/)?.[1]

    expect(ease?.split(',').map(Number)).toEqual([...EASE])
  })
})
