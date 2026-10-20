import { cn } from '@/lib/utils'
import { seedHash } from '@/lib/tilt'

// Lines drawn by hand across the page: each wavers a little, and none is quite level.
const STROKES = [
  'M1 5C8 4.9 27 4.8 40 4.8C53 4.7 67 5 80 4.6C93 4.2 107 2.5 120 2.4C133 2.2 147 3.3 160 3.7C173 4.1 187 4.6 200 4.9C213 5.1 227 5.3 240 5C253 4.8 267 3.8 280 3.4C293 3 307 2.4 320 2.6C333 2.8 347 4.1 360 4.5C373 4.9 392 4.9 399 5',
  'M1 5.3C8 5.1 27 4.3 40 3.9C53 3.5 67 3 80 2.9C93 2.8 107 3.1 120 3.2C133 3.4 147 3.3 160 3.7C173 4.1 187 5.5 200 5.6C213 5.7 227 4.5 240 4.3C253 4.1 267 4.9 280 4.5C293 4.1 307 2.3 320 2.2C333 2.1 347 3.5 360 3.8C373 4 392 3.7 399 3.7',
  'M1 3C8 3.1 27 3 40 3.3C53 3.6 67 4.4 80 4.7C93 5 107 5.6 120 5.2C133 4.8 147 2.7 160 2.4C173 2.1 187 2.9 200 3.5C213 4 227 5.6 240 5.6C253 5.7 267 4.3 280 3.9C293 3.5 307 3.1 320 3.1C333 3 347 3.2 360 3.6C373 4 392 5 399 5.3',
  'M1 4.3C8 4.5 27 5.8 40 5.7C53 5.6 67 4.3 80 3.9C93 3.4 107 3.1 120 3.1C133 3 147 3.7 160 3.6C173 3.5 187 2.4 200 2.5C213 2.7 227 4.2 240 4.6C253 5.1 267 5.2 280 5.1C293 5.1 307 4.4 320 4.4C333 4.4 347 5.4 360 5.1C373 4.9 392 3.3 399 2.9',
]
// Each stroke also comes mirrored, left to right and top to bottom: 16 lines from 4.
const MIRRORS = [
  undefined,
  'matrix(-1 0 0 1 400 0)',
  'matrix(1 0 0 -1 0 8)',
  'matrix(-1 0 0 -1 400 8)',
]

/**
 * A line between sections, drawn by hand in ink instead of ruled. The seed (e.g. the
 * section's title) picks the stroke, so it stays the same between renders and lines next to
 * each other differ. It stretches to any width; the stroke keeps its thickness.
 */
export function InkDivider({ seed, className }: { seed: string; className?: string }) {
  const pick = seedHash(seed)
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 8"
      preserveAspectRatio="none"
      className={cn('block h-2 w-full overflow-visible text-line-strong', className)}
    >
      <path
        d={STROKES[pick % STROKES.length]}
        transform={MIRRORS[Math.floor(pick / STROKES.length) % MIRRORS.length]}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
