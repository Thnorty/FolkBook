import { useQuery } from '@tanstack/react-query'
import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { currentUserQuery } from '@/api/session'
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

function SettingsNav() {
  const user = useQuery(currentUserQuery).data
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
                    <ChevronRight aria-hidden className="ml-auto size-4 text-ink-faint md:hidden" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </nav>
  )
}
