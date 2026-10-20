import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { partOfDay, usePartOfDay } from './partOfDay'

const at = (hours: number, minutes = 0) => new Date(2026, 9, 20, hours, minutes)

describe('partOfDay', () => {
  it.each([
    [at(4, 59), 'night'],
    [at(5), 'morning'],
    [at(11, 59), 'morning'],
    [at(12), 'afternoon'],
    [at(16, 59), 'afternoon'],
    [at(17), 'evening'],
    [at(21, 59), 'evening'],
    [at(22), 'night'],
    [at(0), 'night'],
  ])('calls %s %s', (time, part) => {
    expect(partOfDay(time)).toBe(part)
  })
})

describe('usePartOfDay', () => {
  afterEach(() => vi.useRealTimers())

  it('moves on when the clock passes into the next part of the day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(at(11, 58))
    const { result } = renderHook(() => usePartOfDay())
    expect(result.current).toBe('morning')

    act(() => vi.advanceTimersByTime(60_000))
    expect(result.current).toBe('morning')

    act(() => vi.advanceTimersByTime(60_000))
    expect(result.current).toBe('afternoon')
  })
})
