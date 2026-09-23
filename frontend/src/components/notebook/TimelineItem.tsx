import type { ReactNode } from 'react'
import { formatDay } from '@/lib/dates'

type TimelineItemProps = {
  /** Calendar day from the API, e.g. "2026-09-12". */
  date: string
  /** What kind of moment, e.g. "Coffee". */
  kind?: string
  title: string
  children?: ReactNode
}

/** One entry on a person's timeline: a dot on the line, the date, what happened. */
export function TimelineItem({ date, kind, title, children }: TimelineItemProps) {
  return (
    <li className="flex gap-3">
      <div aria-hidden className="flex flex-none flex-col items-center gap-1 pt-1">
        <span className="size-2.5 rounded-full bg-accent" />
        <span className="min-h-8 w-px flex-1 bg-line-strong" />
      </div>
      <div className="pb-4">
        <p className="type-meta text-ink-faint">
          <time dateTime={date}>{formatDay(date)}</time>
          {kind && ` · ${kind}`}
        </p>
        <p className="mt-0.5 type-heading">{title}</p>
        {children && <div className="mt-1 type-small text-ink-soft">{children}</div>}
      </div>
    </li>
  )
}
