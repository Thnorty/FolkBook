import { AnimatePresence, useIsPresent } from 'motion/react'
import * as m from 'motion/react-m'
import { useState } from 'react'
import { DURATION, EASE, REDUCED_TRANSITION } from './tokens'
import { useReducedMotion } from './useReducedMotion'

// Up rolls the new number in from below; down, from above.
const ROLL = {
  enter: (up: boolean) => ({ y: up ? '100%' : '-100%' }),
  shown: { y: '0%', transition: { duration: DURATION.roll, ease: EASE } },
  leave: (up: boolean) => ({
    y: up ? '-100%' : '100%',
    transition: { duration: DURATION.roll, ease: EASE },
  }),
}
const FADE = {
  enter: { opacity: 0 },
  shown: { opacity: 1, transition: REDUCED_TRANSITION },
  leave: { opacity: 0, transition: REDUCED_TRANSITION },
}

/**
 * A count that rolls to its new value when it changes, like a counter wheel: the old number
 * slides out as the new one slides in. With reduced motion they fade.
 */
export function RollingNumber({ value }: { value: number }) {
  const reduced = useReducedMotion()
  const [last, setLast] = useState({ value, up: true })
  const up = value === last.value ? last.up : value > last.value
  if (value !== last.value) setLast({ value, up })

  return (
    <span className="inline-grid overflow-hidden">
      <AnimatePresence initial={false} custom={up}>
        <Digits key={value} value={value} up={up} variants={reduced ? FADE : ROLL} />
      </AnimatePresence>
    </span>
  )
}

type DigitsProps = { value: number; up: boolean; variants: typeof ROLL | typeof FADE }

function Digits({ value, up, variants }: DigitsProps) {
  // The number on its way out is only a picture of the old count.
  const present = useIsPresent()
  return (
    <m.span
      variants={variants}
      custom={up}
      initial="enter"
      animate="shown"
      exit="leave"
      aria-hidden={!present || undefined}
      className="col-start-1 row-start-1"
    >
      {value}
    </m.span>
  )
}
