import { animate } from 'motion/react'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
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
 *
 * The flight happens on a copy fixed above the whole page, because the panel scrolls and
 * would clip anything moving in from outside it. The real content shows once it lands.
 */
export function FlyFrom({ from, children, className }: FlyFromProps) {
  const home = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  useLayoutEffect(() => {
    const element = home.current
    if (!from || reduced || !element) return
    const to = element.getBoundingClientRect()
    const offset = flyOffset(from, to)
    if (!offset) return

    const copy = element.cloneNode(true) as HTMLElement
    copy.setAttribute('aria-hidden', 'true')
    copy.dataset.flying = ''
    Object.assign(copy.style, {
      position: 'fixed',
      left: `${to.left}px`,
      top: `${to.top}px`,
      width: `${to.width}px`,
      height: `${to.height}px`,
      margin: '0',
      zIndex: '50',
      pointerEvents: 'none',
    })
    document.body.append(copy)
    element.style.visibility = 'hidden'

    const flight = animate(
      copy,
      { x: [offset.x, 0], y: [offset.y, 0], scale: [offset.scale, 1] },
      { duration: DURATION.pageTurn, ease: EASE },
    )
    const land = () => {
      copy.remove()
      element.style.visibility = ''
    }
    void flight.then(land)
    return () => {
      flight.stop()
      land()
    }
  }, [from, reduced])

  return (
    <div ref={home} className={className}>
      {children}
    </div>
  )
}
