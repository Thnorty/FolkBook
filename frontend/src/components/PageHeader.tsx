import type { ReactNode } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'

type PageHeaderProps = {
  title: string
  /** Small caps line next to the title, e.g. the date on Today. */
  meta?: ReactNode
  /** Buttons on the right. */
  actions?: ReactNode
}

/** A page's title row. Also names the browser tab after the page. */
export function PageHeader({ title, meta, actions }: PageHeaderProps) {
  usePageTitle(title)

  return (
    <header className="flex flex-wrap items-end gap-x-3.5 gap-y-1 border-b border-line pb-3.5">
      <h1 className="type-display">{title}</h1>
      {meta && <p className="pb-1 type-meta text-ink-faint">{meta}</p>}
      {actions && <div className="ml-auto flex gap-2">{actions}</div>}
    </header>
  )
}
