import * as m from 'motion/react-m'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { DURATION, EASE_OVERSHOOT, REDUCED_TRANSITION } from './tokens'
import { useReducedMotion } from './useReducedMotion'

// Stamped by hand, so never quite straight.
const TILT = -5

/**
 * A rubber stamp in ink, e.g. "Logged" on an entry just added: it presses down from bigger
 * than life and settles with a small bounce. With reduced motion it fades in.
 */
export function Stamp({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion()
  return (
    <m.span
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 1.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={reduced ? REDUCED_TRANSITION : { duration: DURATION.stamp, ease: EASE_OVERSHOOT }}
      style={{ rotate: TILT }}
      className={cn('inline-block rounded-tab border-2 border-accent px-1 text-accent', className)}
    >
      {children}
    </m.span>
  )
}
