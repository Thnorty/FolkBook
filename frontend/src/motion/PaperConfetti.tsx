import * as m from 'motion/react-m'
import { seedHash } from '@/lib/tilt'
import { cn } from '@/lib/utils'
import { DURATION, EASE_IN } from './tokens'
import { useReducedMotion } from './useReducedMotion'

const COLORS = ['bg-note-yellow', 'bg-note-pink', 'bg-note-green', 'bg-note-blue']
const PIECES = 12
// A few bits start late, but all are down within the decorative limit (≤ 700ms).
const STAGGER = 0.03

// Steps of the golden ratio spread the pieces out without ever lining them up.
const scatter = (start: number, index: number, step: number) => (start + index * step) % 1

/**
 * A handful of paper bits in the sticky-note colors falling past whatever it's placed over
 * (in a `relative` box), turning as they go: a birthday. Plays once when it appears. With
 * reduced motion there's none.
 */
export function PaperConfetti({ seed }: { seed: string }) {
  const reduced = useReducedMotion()
  if (reduced) return null

  return (
    <span aria-hidden data-confetti className="pointer-events-none absolute inset-0">
      {Array.from({ length: PIECES }, (_, index) => {
        const start = (seedHash(seed) % 1000) / 1000
        return (
          <m.span
            key={index}
            initial={{ y: 0, rotate: 0, opacity: 1 }}
            animate={{
              y: 110 + 40 * scatter(start, index, 0.382),
              rotate: (scatter(start, index, 0.271) * 2 - 1) * 300,
              opacity: [1, 1, 0],
            }}
            transition={{
              duration: DURATION.confetti,
              ease: EASE_IN,
              delay: (index % 4) * STAGGER,
            }}
            style={{ left: `${90 * scatter(start, index, 0.618) + 5}%` }}
            className={cn('absolute -top-3 h-2 w-1.5', COLORS[index % COLORS.length])}
          />
        )
      })}
    </span>
  )
}
