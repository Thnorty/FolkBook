import { useEffect, useState } from 'react'
import { DURATION } from '@/motion/tokens'
import { useReducedMotion } from '@/motion/useReducedMotion'

/**
 * How many of a route's steps to draw: one more at a time, like a pen stroke, all within
 * the ink duration; again from the start when `key` (the route shown) changes. With
 * reduced motion, all at once: the canvas can't fade a line in.
 */
export function useStepReveal(steps: number, key: string): number {
  const reduced = useReducedMotion()
  const [reached, setReached] = useState({ key, count: 0 })
  useEffect(() => {
    if (reduced) return
    const every = (DURATION.ink * 1000) / steps
    const timers = Array.from({ length: steps }, (_, index) =>
      setTimeout(() => setReached({ key, count: index + 1 }), every * (index + 1)),
    )
    return () => timers.forEach(clearTimeout)
  }, [key, steps, reduced])
  if (reduced) return steps
  return reached.key === key ? reached.count : 0
}
