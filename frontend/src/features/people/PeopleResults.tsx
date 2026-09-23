import { useInfiniteQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { FlyOrigin } from '@/motion/FlyFrom'
import { PersonRow, PersonTile } from './PersonLink'
import { peopleListQuery, type PeopleFilters } from './queries'

type PeopleResultsProps = {
  filters: PeopleFilters
  grid?: boolean
  /** Desktop only: a plain click opens this person beside the list. */
  onPeek?: (personId: string, from: FlyOrigin) => void
  /** Shown when nobody matches; `null` when there is nothing at all yet. */
  empty: ReactNode
  /** Shown instead of `empty` when the only one there is your own Me. */
  onlyMe?: ReactNode
}

/** A list (or grid) of people from the server, 50 at a time with "Show more". */
export function PeopleResults({
  filters,
  grid = false,
  onPeek,
  empty,
  onlyMe,
}: PeopleResultsProps) {
  const list = useInfiniteQuery(peopleListQuery(filters))
  const people = list.data?.pages.flatMap((page) => page.items) ?? []

  let content: ReactNode
  if (list.isPending) {
    content = <p className="py-10 text-center text-ink-soft">Opening your notebook…</p>
  } else if (list.isError) {
    content = (
      <div className="py-10 text-center">
        <p className="text-danger">{list.error.message}</p>
        <Button variant="secondary" className="mt-4" onClick={() => void list.refetch()}>
          Try again
        </Button>
      </div>
    )
  } else if (people.length === 0) {
    content = empty
  } else if (onlyMe && people.every((person) => person.is_me)) {
    content = onlyMe
  } else {
    content = (
      <>
        <ul
          className={cn(
            grid ? 'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4' : 'flex flex-col gap-2',
          )}
        >
          {people.map((person) => (
            <li key={person.id}>
              {grid ? (
                <PersonTile person={person} />
              ) : (
                <PersonRow person={person} onPeek={onPeek} />
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
    )
  }

  return (
    <section aria-label="People" aria-busy={list.isPending}>
      {content}
    </section>
  )
}

/** "No one matches" with a way out. */
export function NoMatch({ onClear }: { onClear: () => void }) {
  return (
    <div className="py-10 text-center">
      <p className="text-ink-soft">No one matches.</p>
      <Button variant="secondary" className="mt-4" onClick={onClear}>
        Clear filters
      </Button>
    </div>
  )
}
