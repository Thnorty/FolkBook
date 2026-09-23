import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Plus, UsersRound } from 'lucide-react'
import type { CurrentUser } from '@/api/session'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { peopleCountQuery } from '@/features/people/queries'
import { spacesQuery } from '@/features/spaces/queries'
import { cn } from '@/lib/utils'
import { Logo } from './Logo'
import { SECTIONS, SHORTCUTS } from './nav'
import { UserMenu } from './UserMenu'

const ROW = 'flex items-center rounded-card px-2.5 text-ink-soft hover:bg-hover hover:text-ink'
const COUNT = 'ml-auto type-meta text-ink-faint'

/** The desktop sidebar (screen 1f). Hidden on phones, where the bottom tabs take over. */
export function Sidebar({ user, onSearch }: { user: CurrentUser; onSearch: () => void }) {
  const peopleCount = useQuery(peopleCountQuery).data
  const spaces = useQuery(spacesQuery).data?.items ?? []

  return (
    <aside className="sticky top-0 hidden h-dvh w-57 flex-none flex-col border-r border-line bg-chrome px-3 py-4 md:flex">
      <Link to="/" className="rounded-card px-1.5 pb-3.5">
        <Logo />
      </Link>
      <button
        type="button"
        onClick={onSearch}
        className="mb-3.5 flex w-full cursor-pointer items-center justify-between rounded-card border border-line-strong bg-card px-2.5 py-2 text-md text-ink-faint"
      >
        Search
        <Kbd shortcut={SHORTCUTS.palette} />
      </button>

      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col">
        <ul className="flex flex-col gap-0.5">
          {SECTIONS.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                activeOptions={{ exact: to === '/' }}
                className={cn(
                  ROW,
                  'gap-2.5 py-2 text-input font-medium',
                  'data-[status=active]:bg-card data-[status=active]:font-semibold data-[status=active]:text-ink data-[status=active]:shadow-marker',
                )}
              >
                <Icon className="size-4" />
                {label}
                {to === '/people' && peopleCount !== undefined && (
                  <span className={COUNT}>{peopleCount}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>

        <h2 className="px-2.5 pt-4.5 pb-2 type-label text-ink-faint">Spaces</h2>
        <ul className="flex min-h-0 flex-col gap-px overflow-y-auto">
          {spaces.map((space) => (
            <li key={space.id} data-space={space.color}>
              <Link
                to="/spaces/$spaceId"
                params={{ spaceId: space.id }}
                className={cn(
                  ROW,
                  'gap-2.5 py-1.75 text-md font-medium',
                  'data-[status=active]:bg-space/14 data-[status=active]:text-ink',
                )}
              >
                <span aria-hidden className="h-3.75 w-0.75 flex-none rounded-full bg-space" />
                <span className="truncate">{space.name}</span>
                {space.member_count > 0 ? (
                  <span className="ml-auto text-space">
                    <UsersRound aria-hidden className="size-3" />
                    <span className="sr-only">(shared)</span>
                  </span>
                ) : (
                  <span className={COUNT}>{space.people_count}</span>
                )}
              </Link>
            </li>
          ))}
          <li>
            <Link
              to="/spaces/new"
              className={cn(ROW, 'gap-2 py-1.75 text-sm font-medium text-accent')}
            >
              <Plus aria-hidden className="size-3.5" />
              New space
            </Link>
          </li>
        </ul>
      </nav>

      <div className="mt-4 flex flex-col gap-2.5">
        <Button asChild className="justify-start">
          <Link to="/capture">
            <Plus aria-hidden />
            Quick capture
            <Kbd shortcut={SHORTCUTS.quickCapture} className="ml-auto opacity-70" />
          </Link>
        </Button>
        <UserMenu user={user} />
      </div>
    </aside>
  )
}
