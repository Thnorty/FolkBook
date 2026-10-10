import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { ApiError } from '@/api/errors'
import { Button } from '@/components/ui/button'
import { personQuery } from '@/features/person/queries'
import { useConnectionForm } from '@/features/person/useConnectionForm'
import { pathsQuery } from './queries'
import { alsoVia, routeTitle, stepLabel, whyLine } from './route'

type RouteSummaryProps = {
  personId: string
  /** Which route is drawn: 0 is the shortest, then the others. */
  shown: number
  onShow: (index: number) => void
  onClear: () => void
}

const gone = (error: Error | null) => error instanceof ApiError && error.status === 404

/**
 * How you know someone, in words (screens 3f, 3g): the route drawn on the graph, step by
 * step, why they're in your book, and the other routes. A card over the graph on desktop,
 * a sheet from the bottom on phones.
 */
export function RouteSummary({ personId, shown, onShow, onClear }: RouteSummaryProps) {
  const person = useQuery(personQuery(personId))
  const paths = useQuery(pathsQuery(personId))
  const { openConnect } = useConnectionForm()
  const first = person.data?.name.split(' ')[0]
  const clear = (
    <Button variant="ghost" onClick={onClear}>
      Clear
    </Button>
  )

  let content: ReactNode
  if (gone(person.error) || gone(paths.error)) {
    content = (
      <>
        <p>This person isn&apos;t in your book anymore.</p>
        <div className="mt-3">{clear}</div>
      </>
    )
  } else if (person.isError || paths.isError) {
    content = <p className="text-danger">{(person.error ?? paths.error)?.message}</p>
  } else if (!person.data || !paths.data) {
    content = <p className="text-ink-soft">Finding the way…</p>
  } else if (paths.data.paths.length === 0) {
    content = (
      <>
        <p>You haven&apos;t said how you know {first} yet.</p>
        <div className="mt-3 flex gap-2">
          <Button onClick={() => openConnect(personId)}>Connect…</Button>
          {clear}
        </div>
      </>
    )
  } else {
    const routes = paths.data.paths
    const route = routes[shown] ?? routes[0]
    const why = whyLine(person.data)
    content = (
      <>
        <h2 className="type-heading">{routeTitle(person.data.name, route.hops.length)}</h2>
        <ol aria-label="Steps" className="mt-3 flex flex-col gap-1">
          <li className="font-medium">Me</li>
          {route.hops.map((step) => (
            <li key={step.id} className="flex flex-wrap items-baseline gap-x-2">
              <span className="type-hand text-ink-soft">{stepLabel(step)}</span>
              <span className="font-medium">{step.target.name}</span>
            </li>
          ))}
        </ol>
        {why && <p className="mt-3 type-small text-ink-soft">{why}</p>}
        {routes.length > 1 && (
          <ul className="mt-3 flex flex-col gap-1 border-t border-line pt-3">
            {routes.slice(1).map((other, index) =>
              index + 1 === shown ? (
                <li key={index}>
                  <Button variant="ghost" onClick={() => onShow(0)}>
                    Back to the shortest
                  </Button>
                </li>
              ) : (
                <li key={index} className="flex items-baseline gap-2 type-small text-ink-soft">
                  <span className="min-w-0 flex-1">{alsoVia(other)}</span>
                  <Button variant="ghost" onClick={() => onShow(index + 1)}>
                    Show
                  </Button>
                </li>
              ),
            )}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link to="/people/$personId" params={{ personId }}>
              Open {first}&apos;s profile
            </Link>
          </Button>
          {clear}
        </div>
      </>
    )
  }

  return (
    <section
      aria-label={first ? `How you know ${first}` : 'How you know them'}
      className="fixed inset-x-0 bottom-0 z-20 max-h-[70dvh] overflow-y-auto rounded-t-sheet border-t border-line bg-paper p-5 pb-24 shadow-float md:absolute md:inset-x-auto md:top-3 md:bottom-auto md:left-3 md:w-80 md:rounded-card md:border md:pb-5"
    >
      {content}
    </section>
  )
}
