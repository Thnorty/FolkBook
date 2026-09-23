import type { ReactNode } from 'react'

type ProfileSectionProps = {
  title: string
  /** Small caps note next to the title, e.g. "private" or "5 current · 3 former". */
  meta?: ReactNode
  /** A button or link on the right, e.g. "+ Add". */
  action?: ReactNode
  children: ReactNode
}

/** One block of the profile: Remember, Notes, Connections, Timeline… */
export function ProfileSection({ title, meta, action, children }: ProfileSectionProps) {
  const id = `section-${title.toLowerCase().replaceAll(' ', '-')}`
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2.5">
        <h2 id={id} className="type-label text-ink-soft">
          {title}
        </h2>
        {meta && <span className="type-meta text-ink-faint">{meta}</span>}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  )
}
