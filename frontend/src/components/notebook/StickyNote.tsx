import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { tilt } from '@/lib/tilt'

const COLORS = {
  yellow: 'bg-note-yellow',
  pink: 'bg-note-pink',
  green: 'bg-note-green',
  blue: 'bg-note-blue',
} as const

export type NoteColor = keyof typeof COLORS

type StickyNoteProps = {
  /** Stable id, so the tilt stays the same. */
  seed: string
  color?: NoteColor
  children: ReactNode
  className?: string
}

/** A memory aid: handwriting on a small tilted note. Memory aids are always private. */
export function StickyNote({ seed, color = 'yellow', children, className }: StickyNoteProps) {
  return (
    <div
      className={cn('px-3.5 pt-3 pb-3.5 shadow-note', COLORS[color], className)}
      style={{ rotate: `${tilt(seed, 3)}deg` }}
    >
      <p className="type-hand text-note-ink">{children}</p>
    </div>
  )
}
