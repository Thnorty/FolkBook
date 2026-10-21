import type { ReactNode } from 'react'

type DoodleProps = {
  /** The drawing's grid, e.g. "0 0 48 48"; draw at the size it's shown so strokes stay thin. */
  viewBox: string
  className?: string
  children: ReactNode
}

/** A small drawing in ink: round-ended strokes in the text color. Decoration only. */
export function Doodle({ viewBox, className, children }: DoodleProps) {
  return (
    <svg
      aria-hidden
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  )
}
