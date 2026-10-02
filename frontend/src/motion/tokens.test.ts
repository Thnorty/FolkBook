/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DURATION, EASE, LIMITS } from './tokens'

describe('motion tokens', () => {
  it('keep UI transitions within 450ms and decorative effects within 700ms', () => {
    const { ink, ...ui } = DURATION
    for (const duration of Object.values(ui)) expect(duration).toBeLessThanOrEqual(LIMITS.ui)
    expect(ink).toBeLessThanOrEqual(LIMITS.decorative)
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
