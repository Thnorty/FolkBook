import { useAnimate } from 'motion/react'
import { useLayoutEffect, type ReactNode } from 'react'
import { flyOffset } from './flyOffset'
import { DURATION, EASE } from './tokens'
import { useReducedMotion } from './useReducedMotion'

/** Where a card's photo and name were when it was clicked. */
export type FlyOrigin = { photo?: DOMRect; name?: DOMRect }

type FlyFromProps = {
  /** Where the element was on screen (e.g. on the card that was clicked). */
  from?: DOMRect | null
  children: ReactNode
  className?: string
}

/**
 * Glides its content in from `from` to where it sits, like the page turn, but as a copy:
 * whatever was at `from` stays there. Used by the peek panel, where the card stays in view.
 */
export function FlyFrom({ from, children, className }: FlyFromProps) {
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const reduced = useReducedMotion()

  useLayoutEffect(() => {
    const element = scope.current
    if (!from || reduced || !element) return
    const offset = flyOffset(from, element.getBoundingClientRect())
    if (!offset) return
    animate(
      element,
      { x: [offset.x, 0], y: [offset.y, 0], scale: [offset.scale, 1] },
      { duration: DURATION.pageTurn, ease: EASE },
    )
  }, [from, reduced, animate, scope])

  return (
    <div ref={scope} className={className}>
      {children}
    </div>
  )
}
