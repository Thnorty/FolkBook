import { describe, expect, it } from 'vitest'
import { closesSheet } from './sheetDrag'

describe('closesSheet', () => {
  const height = 600

  it('closes once dragged down past a third of the sheet', () => {
    expect(closesSheet(201, 0, height)).toBe(true)
    expect(closesSheet(199, 0, height)).toBe(false)
  })

  it('closes on a quick flick down, however short', () => {
    expect(closesSheet(30, 800, height)).toBe(true)
  })

  it('stays open after a drag up or a slow nudge', () => {
    expect(closesSheet(-50, -900, height)).toBe(false)
    expect(closesSheet(60, 100, height)).toBe(false)
  })
})
