import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { LayoutGrid, List, UserPlus } from 'lucide-react'
import { useCallback } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { SHORTCUTS } from '@/app/nav'
import { spacesQuery } from '@/features/spaces/queries'
import { cn } from '@/lib/utils'
import { EmptyBook } from './EmptyBook'
import { PeekPanel } from './PeekPanel'
import { FilterChips, SpaceBanner } from './Filters'
import { PersonRow, PersonTile } from './PersonLink'
import { needsDetailsCountQuery, peopleCountQuery, peopleListQuery } from './queries'
import { SearchBox } from './SearchBox'
import type { PeopleSearch } from './search'

/** Everyone in your notebook (screens 1c, 4c, 4d, 6h). */
export function PeoplePage() {
  const { q = '', space, needs = false, view, peek } = useSearch({ from: '/app/people' })
  const navigate = useNavigate({ from: '/people' })
  const setSearch = useCallback(
    (change: Partial<PeopleSearch>) =>
      void navigate({ search: (current) => ({ ...current, ...change }), replace: true }),
    [navigate],
  )
  const search = useCallback((text: string) => setSearch({ q: text || undefined }), [setSearch])
  const closePeek = useCallback(() => setSearch({ peek: undefined }), [setSearch])

  const total = useQuery(peopleCountQuery).data
  const needsCount = useQuery(needsDetailsCountQuery).data
  const spaces = useQuery(spacesQuery).data?.items ?? []
  const list = useInfiniteQuery(peopleListQuery({ search: q, space, needsDetails: needs }))
  const people = list.data?.pages.flatMap((page) => page.items) ?? []
  const filtered = Boolean(q || space || needs)
  const pickedSpace = spaces.find((item) => item.id === space)
  const grid = view === 'grid'

  return (
    <div
      className={cn(
        'mx-auto px-4 py-6 md:px-8',
        peek
          ? 'max-w-7xl md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] md:gap-6'
          : 'max-w-5xl',
      )}
    >
      <div className="min-w-0">
        <PageHeader
          title="People"
          meta={total !== undefined && `${total} in your notebook`}
          actions={
            <>
              <div role="group" aria-label="Show as" className="hidden gap-1 md:flex">
                <Button
                  variant="ghost"
                  aria-pressed={!grid}
                  aria-label="List"
                  onClick={() => setSearch({ view: undefined })}
                  className={cn(!grid && 'bg-hover text-ink')}
                >
                  <List aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  aria-pressed={grid}
                  aria-label="Grid"
                  onClick={() => setSearch({ view: 'grid' })}
                  className={cn(grid && 'bg-hover text-ink')}
                >
                  <LayoutGrid aria-hidden />
                </Button>
              </div>
              <Button asChild variant="secondary">
                <Link to="/people/new">
                  <UserPlus aria-hidden />
                  Add person
                  <Kbd shortcut={SHORTCUTS.addPerson} className="hidden text-ink-faint md:inline" />
                </Link>
              </Button>
            </>
          }
        />

        <div className="mt-5 flex flex-col gap-3">
          <SearchBox value={q} onSearch={search} />
          <FilterChips
            spaces={spaces}
            space={space}
            needsDetails={needs}
            needsDetailsCount={needsCount}
            onChange={(filters) =>
              setSearch({ space: filters.space, needs: filters.needsDetails || undefined })
            }
          />
          {pickedSpace && <SpaceBanner space={pickedSpace} />}
        </div>

        <section aria-label="People" aria-busy={list.isPending} className="mt-5">
          {list.isPending ? (
            <p className="py-10 text-center text-ink-soft">Opening your notebook…</p>
          ) : list.isError ? (
            <div className="py-10 text-center">
              <p className="text-danger">{list.error.message}</p>
              <Button variant="secondary" className="mt-4" onClick={() => void list.refetch()}>
                Try again
              </Button>
            </div>
          ) : people.length === 0 || (!filtered && people.every((person) => person.is_me)) ? (
            filtered ? (
              <div className="py-10 text-center">
                <p className="text-ink-soft">No one matches.</p>
                <Button
                  variant="secondary"
                  className="mt-4"
                  onClick={() => setSearch({ q: undefined, space: undefined, needs: undefined })}
                >
                  Clear filters
                </Button>
              </div>
            ) : (
              <EmptyBook />
            )
          ) : (
            <>
              <ul
                className={cn(
                  grid
                    ? 'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4'
                    : 'flex flex-col gap-2',
                )}
              >
                {people.map((person) => (
                  <li key={person.id}>
                    {grid ? (
                      <PersonTile person={person} />
                    ) : (
                      <PersonRow person={person} onPeek={(id) => setSearch({ peek: id })} />
                    )}
                  </li>
                ))}
              </ul>
              {list.hasNextPage && (
                <div className="mt-5 flex justify-center">
                  <Button
                    variant="secondary"
                    disabled={list.isFetchingNextPage}
                    onClick={() => void list.fetchNextPage()}
                  >
                    {list.isFetchingNextPage ? 'Loading…' : 'Show more'}
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
      {peek && <PeekPanel personId={peek} onClose={closePeek} />}
    </div>
  )
}
