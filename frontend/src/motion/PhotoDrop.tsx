import * as m from 'motion/react-m'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { DURATION, EASE, EASE_OVERSHOOT, REDUCED_TRANSITION } from './tokens'
import { useReducedMotion } from './useReducedMotion'

type PhotoDropProps = {
  /** Drop in when it appears. Off where a photo is only being shown. */
  drop: boolean
  children: ReactNode
  className?: string
}

/**
 * A photo landing on the page (motion spec, "Polaroid drop on upload"): it falls 24px
 * from −12°, overshoots its own tilt and settles, while its shadow shrinks under it. It
 * drops when it appears: give it a new `key` for each new photo. With reduced motion it
 * fades in.
 */
export function PhotoDrop({ drop, children, className }: PhotoDropProps) {
  const reduced = useReducedMotion()
  const landing = { duration: DURATION.polaroidDrop, ease: EASE }
  return (
    <m.div
      initial={drop && (reduced ? { opacity: 0 } : { y: -24, rotate: -12 })}
      animate={reduced ? { opacity: 1 } : { y: 0, rotate: 0 }}
      transition={reduced ? REDUCED_TRANSITION : { ...landing, ease: EASE_OVERSHOOT }}
      className={cn('relative', className)}
    >
      {drop && !reduced && (
        // Paper still in the air casts a bigger shadow.
        <m.span
          aria-hidden
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={landing}
          className="pointer-events-none absolute inset-0 -z-10 shadow-float"
        />
      )}
      {children}
    </m.div>
  )
}
