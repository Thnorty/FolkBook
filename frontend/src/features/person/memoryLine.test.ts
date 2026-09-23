import { describe, expect, it } from 'vitest'
import { memoryLine } from './memoryLine'

const NOTE = "Coffee at Kronotrop. Arda's into dinosaurs! She changes teams in October.\nLoves figs"
const at = (words: string) => NOTE.indexOf(words) + 2

describe('memoryLine', () => {
  it.each([
    ['Coffee', 'Coffee at Kronotrop'],
    ['dinosaurs', "Arda's into dinosaurs!"],
    ['teams', 'She changes teams in October'],
    ['figs', 'Loves figs'],
  ])('takes the sentence around the cursor in “%s”', (words, expected) => {
    expect(memoryLine(NOTE, at(words), at(words))).toBe(expected)
  })

  it('takes the sentence just typed when the cursor is at its end', () => {
    const end = NOTE.indexOf('\n')
    expect(memoryLine(NOTE, end, end)).toBe('She changes teams in October')
    expect(memoryLine('Likes tea.', 10, 10)).toBe('Likes tea')
  })

  it('takes exactly what is selected', () => {
    const start = NOTE.indexOf('Arda')
    expect(memoryLine(NOTE, start, start + 'Arda'.length)).toBe('Arda')
  })

  it('keeps an ellipsis, and gives nothing for an empty note', () => {
    expect(memoryLine('Maybe moving…', 3, 3)).toBe('Maybe moving…')
    expect(memoryLine('Maybe moving...', 3, 3)).toBe('Maybe moving...')
    expect(memoryLine('', 0, 0)).toBe('')
  })
})
