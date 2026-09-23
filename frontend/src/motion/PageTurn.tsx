import * as m from 'motion/react-m'
import type { ReactNode } from 'react'
import { DURATION, EASE, REDUCED_TRANSITION } from './tokens'
import { useReducedMotion } from './useReducedMotion'

/*
 * The "page turn" (motion spec, screen 6k): tapping a card grows it into the page.
 * Mark the pieces both places show (a person's photo and name) as <Shared> with the
 * same id; Motion moves and scales them from the card to the page over 360ms, and
 * <PageFade> brings the rest of the page in during the last 160ms. With reduced
 * motion nothing moves: the new page simply fades in.
 */

type SharedProps = { id: string; children: ReactNode; className?: string }

/** An element that travels between two screens showing the same thing. */
export function Shared({ id, children, className }: SharedProps) {
  const reduced = useReducedMotion()
  return (
    <m.div
      layoutId={reduced ? undefined : id}
      transition={{ duration: DURATION.pageTurn, ease: EASE }}
      className={className}
    >
      {children}
    </m.div>
  )
}

type PageFadeProps = {
  children: ReactNode
  /** Wait for a page turn's shared elements, fading in over its last 160ms. */
  afterTurn?: boolean
  className?: string
}

/** Fades a page's content in when it appears. */
export function PageFade({ children, afterTurn = false, className }: PageFadeProps) {
  const reduced = useReducedMotion()
  const transition = reduced
    ? REDUCED_TRANSITION
    : {
        duration: DURATION.pageFade,
        delay: afterTurn ? DURATION.pageTurn - DURATION.pageFade : 0,
        ease: EASE,
      }
  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={transition}
      className={className}
    >
      {children}
    </m.div>
  )
}
