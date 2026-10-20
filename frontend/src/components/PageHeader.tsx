import { Fragment, type ReactNode } from 'react'
import { InkDivider } from '@/components/notebook/InkDivider'
import { usePageTitle } from '@/lib/usePageTitle'

type PageHeaderProps = {
  title: string
  /** Small caps line next to the title, e.g. the date on Today. Parts of a list are joined with " · ". */
  meta?: ReactNode | ReactNode[]
  /** Buttons on the right. */
  actions?: ReactNode
}

/** A page's title row. Also names the browser tab after the page. */
export function PageHeader({ title, meta, actions }: PageHeaderProps) {
  usePageTitle(title)

  return (
    <header>
      <div className="flex flex-wrap items-end gap-x-3.5 gap-y-1">
        <h1 className="type-display">{title}</h1>
        {meta && <p className="pb-1 type-meta text-ink-faint">{joined(meta)}</p>}
        {actions && <div className="ml-auto flex gap-2">{actions}</div>}
      </div>
      <InkDivider seed={title} className="mt-3.5" />
    </header>
  )
}

function joined(meta: ReactNode | ReactNode[]): ReactNode {
  if (!Array.isArray(meta)) return meta
  return meta.filter(Boolean).map((part, index) => (
    <Fragment key={index}>
      {index > 0 && ' · '}
      {part}
    </Fragment>
  ))
}
