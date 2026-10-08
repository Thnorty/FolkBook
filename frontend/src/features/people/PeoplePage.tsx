import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { LayoutGrid, List, UserPlus } from 'lucide-react'
import { useCallback, useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { SHORTCUTS } from '@/app/nav'
import { usePersonForm } from '@/features/person/usePersonForm'
import { spacesQuery } from '@/features/spaces/queries'
import { cn } from '@/lib/utils'
import type { FlyOrigin } from '@/motion/FlyFrom'
import { EmptyBook } from './EmptyBook'
import { PeekPanel } from './PeekPanel'
import { FilterChips, FromImport, SpaceBanner } from './Filters'
import { NoMatch, PeopleResults } from './PeopleResults'
import { keptCountQuery, needsDetailsCountQuery, peopleCountQuery } from './queries'
import { SearchBox } from './SearchBox'
import type { PeopleSearch } from './search'

/** Everyone in your notebook (screens 1c, 4c, 4d, 6h). */
export function PeoplePage() {
  const {
    q = '',
    space,
    needs = false,
    kept = false,
    import: importId,
    view,
    peek,
  } = useSearch({ from: '/app/people' })
  const navigate = useNavigate({ from: '/people' })
  const { openNew } = usePersonForm()
  const setSearch = useCallback(
    (change: Partial<PeopleSearch>) =>
      void navigate({
        // Annotated: with this many routes, TypeScript stops inferring it here.
        search: (current: PeopleSearch) => ({ ...current, ...change }),
        replace: true,
      }),
    [navigate],
  )
  const search = useCallback((text: string) => setSearch({ q: text || undefined }), [setSearch])
  const closePeek = useCallback(() => setSearch({ peek: undefined }), [setSearch])
  // Where the clicked card was, so the panel's photo and name glide in from it. Kept with
  // whose card it was: the address (and so the panel) changes a moment later, and the
  // person still shown until then must not fly in from the new card.
  const [peekFrom, setPeekFrom] = useState<{ personId: string; origin: FlyOrigin } | null>(null)
  const openPeek = (personId: string, origin: FlyOrigin) => {
    setPeekFrom({ personId, origin })
    setSearch({ peek: personId })
  }

  const total = useQuery(peopleCountQuery).data
  const needsCount = useQuery(needsDetailsCountQuery).data
  const keptCount = useQuery(keptCountQuery).data
  const spaces = useQuery(spacesQuery).data?.items ?? []
  const filtered = Boolean(q || space || needs || kept || importId)
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
              <Button variant="secondary" onClick={() => openNew()}>
                <UserPlus aria-hidden />
                Add person
                <Kbd shortcut={SHORTCUTS.addPerson} className="hidden text-ink-faint md:inline" />
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
            kept={kept}
            keptCount={keptCount}
            onChange={(filters) =>
              setSearch({
                space: filters.space,
                needs: filters.needsDetails || undefined,
                kept: filters.kept || undefined,
              })
            }
          />
          {importId && (
            <FromImport importId={importId} onClear={() => setSearch({ import: undefined })} />
          )}
          {pickedSpace && <SpaceBanner space={pickedSpace} />}
          {needs && (
            <Button asChild variant="secondary" className="self-start">
              <Link to="/people/fill-in">Fill in the blanks</Link>
            </Button>
          )}
        </div>

        <div className="mt-5">
          <PeopleResults
            filters={{ search: q, space, needsDetails: needs, kept, importId }}
            grid={grid}
            onPeek={openPeek}
            empty={
              filtered ? (
                <NoMatch
                  onClear={() =>
                    setSearch({
                      q: undefined,
                      space: undefined,
                      needs: undefined,
                      kept: undefined,
                      import: undefined,
                    })
                  }
                />
              ) : (
                <EmptyBook />
              )
            }
            onlyMe={!filtered && <EmptyBook />}
          />
        </div>
      </div>
      {peek && (
        <PeekPanel
          personId={peek}
          flyFrom={peekFrom && peekFrom.personId === peek ? peekFrom.origin : null}
          onClose={closePeek}
        />
      )}
    </div>
  )
}
