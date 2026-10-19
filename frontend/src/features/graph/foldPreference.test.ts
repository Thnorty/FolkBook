import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useShowAll } from './foldPreference'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('useShowAll', () => {
  it('folds by default, and remembers Show all on this device', () => {
    const first = renderHook(() => useShowAll())
    expect(first.result.current[0]).toBe(false)

    act(() => first.result.current[1](true))
    expect(first.result.current[0]).toBe(true)
    first.unmount()

    expect(renderHook(() => useShowAll()).result.current[0]).toBe(true)
  })

  it('keeps folding when storage is blocked (private windows)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useShowAll())

    expect(result.current[0]).toBe(false)
    expect(() => act(() => result.current[1](true))).not.toThrow()
    expect(result.current[0]).toBe(true) // for this visit
  })
})
