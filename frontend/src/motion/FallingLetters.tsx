import * as m from 'motion/react-m'
import { useState } from 'react'
import { tilt } from '@/lib/tilt'
import { DURATION, EASE_IN, REDUCED_TRANSITION } from './tokens'
import { useReducedMotion } from './useReducedMotion'

// One letter after another, but all down within the decorative limit (≤ 700ms).
const STAGGER = 0.04
const LAST_START = 0.28

/**
 * A word whose letters drop off the line and land tilted, one after another: what you
 * searched for when no one matched. It plays once; letters typed afterwards show up already
 * fallen. With reduced motion the letters fade in, on the line.
 */
export function FallingLetters({ text }: { text: string }) {
  const reduced = useReducedMotion()
  const [first] = useState(text)

  return (
    <span aria-hidden className="inline-flex flex-wrap justify-center pb-5 type-title">
      {[...text].map((char, index) => {
        const seed = `${index}${char}`
        const fallen = {
          x: `${tilt(`${seed}x`, 0.12)}em`,
          y: `${0.6 + Math.abs(tilt(`${seed}y`, 0.35))}em`,
          rotate: tilt(seed, 40),
        }
        return (
          <m.span
            key={seed}
            initial={
              text === first && (reduced ? { opacity: 0 } : { x: '0em', y: '0em', rotate: 0 })
            }
            animate={reduced ? { opacity: 1 } : fallen}
            transition={
              reduced
                ? REDUCED_TRANSITION
                : {
                    duration: DURATION.letterFall,
                    ease: EASE_IN,
                    delay: Math.min(index * STAGGER, LAST_START),
                  }
            }
            className="inline-block whitespace-pre"
          >
            {char}
          </m.span>
        )
      })}
    </span>
  )
}
