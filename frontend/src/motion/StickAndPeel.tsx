import * as m from 'motion/react-m'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { DURATION, EASE_IN, REDUCED_TRANSITION, STICK_SPRING } from './tokens'
import { useReducedMotion } from './useReducedMotion'

// Peeling: the corner lifts for the first 160ms, then the note slides up and fades.
const PEEL = { duration: DURATION.peel, ease: EASE_IN, times: [0, 0.47, 1] }
// It lifts from the top-left, so the bottom-right corner comes up first.
const FROM_CORNER = { originX: { duration: 0 }, originY: { duration: 0 } }

const NOTE = {
  dropped: { rotate: -10, scale: 1.08 },
  stuck: { rotate: 0, scale: 1, transition: STICK_SPRING },
  peeled: {
    originX: 0,
    originY: 0,
    rotate: [0, 6, 6],
    y: [0, 0, -24],
    opacity: [1, 1, 0],
    transition: { ...PEEL, ...FROM_CORNER },
  },
}

const FADE = {
  dropped: { opacity: 0 },
  stuck: { opacity: 1, transition: REDUCED_TRANSITION },
  peeled: { opacity: 0, transition: REDUCED_TRANSITION },
}

// The shadow grows as the corner lifts off the page.
const SHADOW = {
  dropped: { opacity: 0 },
  stuck: { opacity: 0 },
  peeled: { opacity: [0, 1, 1], transition: PEEL },
}

type StickAndPeelProps = {
  children: ReactNode
  className?: string
}

/**
 * A sticky note's place in a list (motion spec, "Sticky note — stick, then peel"). Inside
 * <AnimatePresence initial={false}>, a new note drops on from −10° and settles at its own
 * tilt; a removed one peels off its corner, slides up and fades. With reduced motion it
 * fades in and out.
 */
export function StickAndPeel({ children, className }: StickAndPeelProps) {
  const reduced = useReducedMotion()
  return (
    <m.li
      variants={reduced ? FADE : NOTE}
      initial="dropped"
      animate="stuck"
      exit="peeled"
      className={cn('relative', className)}
    >
      {!reduced && (
        <m.span
          aria-hidden
          variants={SHADOW}
          className="pointer-events-none absolute inset-0 -z-10 shadow-float"
        />
      )}
      {children}
    </m.li>
  )
}
