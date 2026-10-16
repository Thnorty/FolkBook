import { useQuery } from '@tanstack/react-query'
import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { currentUserQuery } from '@/api/session'
import { mailStatusQuery } from '@/features/mail/queries'
import { PageHeader } from '@/components/PageHeader'
import { cn } from '@/lib/utils'
import { SETTINGS_SECTIONS, type SettingsSection } from './sections'

/**
 * Settings (screens 5m, 5t–5v, 5x): the sections down the side on desktop; on phones a
 * list of them, each opening as its own page.
 */
export function SettingsLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const atIndex = pathname.replace(/\/$/, '') === '/settings'

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
      <PageHeader title="Settings" meta={window.location.host} />
      <NoEmailBanner />
      <div className="mt-6 md:grid md:grid-cols-[12rem_minmax(0,1fr)] md:gap-10">
        <div className={cn(!atIndex && 'hidden md:block')}>
          <SettingsNav />
        </div>
        <div className={cn(atIndex && 'hidden md:block')}>
          {!atIndex && (
            <Link to="/settings" className="mb-4 inline-block type-meta text-ink-faint md:hidden">
              ← Settings
            </Link>
          )}
          <Outlet />
        </div>
      </div>
    </div>
  )
}

/** Admins, while the server can't send email (screen 5w). */
function NoEmailBanner() {
  const user = useQuery(currentUserQuery).data
  const email = useQuery({ ...mailStatusQuery, enabled: Boolean(user?.is_admin) }).data
  if (!user?.is_admin || email?.ready !== false) return null
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-danger/30 bg-danger/8 px-4 py-2.5">
      <span aria-hidden className="size-1.5 rounded-full bg-danger" />
      <p className="type-small">Email isn&apos;t set up; reminders only show on Today</p>
      <Link
        to="/settings/email"
        className="ml-auto type-small font-medium text-accent hover:underline"
      >
        Set up email →
      </Link>
    </div>
  )
}

function SettingsNav() {
  const user = useQuery(currentUserQuery).data
  const email = useQuery({ ...mailStatusQuery, enabled: Boolean(user?.is_admin) }).data
  const groups: { title: string; sections: SettingsSection[] }[] = [
    { title: 'You', sections: SETTINGS_SECTIONS.filter((section) => !section.admin) },
    ...(user?.is_admin
      ? [
          {
            title: 'Server · admin',
            sections: SETTINGS_SECTIONS.filter((section) => section.admin),
          },
        ]
      : []),
  ]

  return (
    <nav aria-label="Settings" className="flex flex-col gap-5">
      {groups
        .filter((group) => group.sections.length > 0)
        .map((group) => (
          <div key={group.title}>
            <h2 className="px-2.5 pb-1 type-label text-ink-faint">{group.title}</h2>
            <ul className="flex flex-col gap-0.5">
              {group.sections.map((section) => (
                <li key={section.to}>
                  <Link
                    to={section.to}
                    className="flex min-h-11 items-center rounded-card px-2.5 text-input text-ink-soft hover:bg-hover hover:text-ink data-[status=active]:bg-card data-[status=active]:font-semibold data-[status=active]:text-ink data-[status=active]:shadow-marker md:min-h-9"
                  >
                    {section.label}
                    <span className="ml-auto flex items-center gap-2">
                      {section.to === '/settings/email' && email?.ready === false && (
                        <span className="size-1.5 rounded-full bg-danger md:mr-1">
                          <span className="sr-only">: not set up</span>
                        </span>
                      )}
                      <ChevronRight aria-hidden className="size-4 text-ink-faint md:hidden" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </nav>
  )
}
