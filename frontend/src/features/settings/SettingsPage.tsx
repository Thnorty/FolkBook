import type { ReactNode } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'

/** One settings page: its title, and its parts. */
export function SettingsPage({ title, children }: { title: string; children: ReactNode }) {
  usePageTitle(`${title} · Settings`)
  return (
    <section aria-labelledby="settings-title" className="flex flex-col gap-8">
      <h2 id="settings-title" className="type-title">
        {title}
      </h2>
      {children}
    </section>
  )
}

/** A part of a settings page, e.g. "Password". */
export function SettingsPart({
  title,
  note,
  action,
  children,
}: {
  title: string
  note?: ReactNode
  action?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="type-heading">{title}</h3>
        {action && <div className="ml-auto">{action}</div>}
        {note && <p className="w-full type-small text-ink-soft">{note}</p>}
      </div>
      {children}
    </div>
  )
}
