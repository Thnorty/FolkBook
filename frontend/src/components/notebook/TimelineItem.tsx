import type { ReactNode } from 'react'
import { formatDay } from '@/lib/dates'

type TimelineItemProps = {
  /** Calendar day from the API, e.g. "2026-09-12". */
  date: string
  /** What kind of moment, e.g. "Coffee". */
  kind?: string
  title: string
  children?: ReactNode
  /** Makes the entry a button, e.g. to change it. */
  onOpen?: () => void
}

/** One entry on a person's timeline: a dot on the line, the date, what happened. */
export function TimelineItem({ date, kind, title, children, onOpen }: TimelineItemProps) {
  const content = (
    <>
      <span className="block type-meta text-ink-faint">
        <time dateTime={date}>{formatDay(date)}</time>
        {kind && ` · ${kind}`}
      </span>
      <span className="mt-0.5 block type-heading">{title}</span>
      {children && (
        <span className="mt-1 block type-small whitespace-pre-line text-ink-soft">{children}</span>
      )}
    </>
  )
  return (
    <li className="flex gap-3">
      <div aria-hidden className="flex flex-none flex-col items-center gap-1 pt-1">
        <span className="size-2.5 rounded-full bg-accent" />
        <span className="min-h-8 w-px flex-1 bg-line-strong" />
      </div>
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="-mx-2 mb-2 flex-1 cursor-pointer rounded-card px-2 pb-2 text-left hover:bg-hover focus-visible:ring-3 focus-visible:ring-focus-glow focus-visible:outline-none"
        >
          {content}
        </button>
      ) : (
        <div className="flex-1 pb-4">{content}</div>
      )}
    </li>
  )
}
