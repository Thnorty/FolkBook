import { animate } from 'motion/react'
import { DURATION, EASE_IN, REDUCED_TRANSITION } from './tokens'

const TEETH = 14

/** A jagged line across the element at `y` percent, keeping what's above it. */
function above(y: number): string {
  const edge = Array.from({ length: TEETH + 1 }, (_, i) => {
    const x = 100 - (i * 100) / TEETH
    return `${x}% ${y + (i % 2 ? 2.5 : -2.5)}%`
  })
  return `polygon(0% 0%, 100% 0%, ${edge.join(', ')})`
}

const WHOLE = { opacity: 1, y: 0, rotate: 0, clipPath: above(105) }
const TORN = { opacity: 0, y: 40, rotate: -5, clipPath: above(-5) }

/**
 * Tear a page out of the book (motion spec, "Page tear on delete"): a jagged edge runs
 * up the page while it tilts 5°, drops 40px and fades. With reduced motion it fades.
 * `putBack` plays it backwards, e.g. when the delete didn't go through.
 */
export function tearOut(element: HTMLElement, reduced: boolean) {
  const transition = reduced ? REDUCED_TRANSITION : { duration: DURATION.tear, ease: EASE_IN }
  const torn = animate(element, reduced ? { opacity: [1, 0] } : pairs(WHOLE, TORN), transition)
  return {
    finished: torn.then(() => undefined),
    putBack: () => {
      torn.stop()
      return animate(element, reduced ? { opacity: 1 } : WHOLE, transition).then(() => {
        element.style.clipPath = ''
      })
    },
  }
}

function pairs<T extends Record<string, string | number>>(from: T, to: T) {
  return Object.fromEntries(Object.keys(from).map((key) => [key, [from[key], to[key]]]))
}
