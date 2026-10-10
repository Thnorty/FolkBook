import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAppearance } from '@/lib/appearance'
import { useStepReveal } from './useStepReveal'

describe('useStepReveal', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    setAppearance({ motion: 'system' })
  })

  it('reveals one more step at a time, all within the ink duration', () => {
    const { result } = renderHook(() => useStepReveal(3, 'tom'))
    expect(result.current).toBe(0)

    act(() => vi.advanceTimersByTime(234))
    expect(result.current).toBe(1)

    act(() => vi.advanceTimersByTime(466))
    expect(result.current).toBe(3)

    act(() => vi.advanceTimersByTime(1000))
    expect(result.current).toBe(3)
  })

  it('starts again for another route', () => {
    const { result, rerender } = renderHook(({ key }) => useStepReveal(3, key), {
      initialProps: { key: 'tom' },
    })
    act(() => vi.advanceTimersByTime(700))
    expect(result.current).toBe(3)

    rerender({ key: 'tom:1' })
    expect(result.current).toBe(0)
  })

  it('shows every step at once with reduced motion', () => {
    setAppearance({ motion: 'reduce' })

    const { result } = renderHook(() => useStepReveal(3, 'tom'))

    expect(result.current).toBe(3)
  })
})
