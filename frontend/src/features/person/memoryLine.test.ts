import { describe, expect, it } from 'vitest'
import { memoryLine } from './memoryLine'

const NOTE = "Coffee at Kronotrop. Arda's into dinosaurs.\nLoves figs"
const select = (words: string) => [NOTE.indexOf(words), NOTE.indexOf(words) + words.length]

describe('memoryLine', () => {
  it('takes exactly what is selected, without spaces or a closing full stop', () => {
    expect(memoryLine(NOTE, ...(select(" Arda's into dinosaurs.") as [number, number]))).toBe(
      "Arda's into dinosaurs",
    )
    expect(memoryLine(NOTE, ...(select('Arda') as [number, number]))).toBe('Arda')
  })

  it('keeps an ellipsis', () => {
    expect(memoryLine('Maybe moving…', 0, 13)).toBe('Maybe moving…')
    expect(memoryLine('Maybe moving...', 0, 15)).toBe('Maybe moving...')
  })

  it('gives nothing without a selection', () => {
    expect(memoryLine(NOTE, 5, 5)).toBe('')
    expect(memoryLine(NOTE, 6, 7)).toBe('') // just a space
  })
})
