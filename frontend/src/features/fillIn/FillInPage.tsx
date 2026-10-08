import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { peopleCount } from '@/features/spaces/labels'
import { cn } from '@/lib/utils'
import { FillInCard } from './FillInCard'
import { fillInQueueQuery } from './queries'

/**
 * Fill in the blanks (screens 4v, 4w): one person at a time, from an import (`?import=`)
 * or everyone under Needs details. Skipped people stay as they were, for next time.
 */
export function FillInPage() {
  const { import: importId } = useSearch({ from: '/app/people/fill-in' })
  const queryClient = useQueryClient()
  const query = fillInQueueQuery(importId)
  const queue = useQuery(query).data
  const [position, setPosition] = useState(0)
  const [done, setDone] = useState<ReadonlySet<string>>(new Set())

  const people = queue?.items ?? []
  const current = people[position]
  const next = (saved: boolean) => {
    if (saved && current) setDone((ids) => new Set(ids).add(current.id))
    setPosition((at) => at + 1)
  }
  const keepGoing = async () => {
    await queryClient.refetchQueries({ queryKey: query.queryKey })
    setPosition(0)
    setDone(new Set())
  }
  const more = (queue?.count ?? 0) - people.length

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 md:px-8">
      <PageHeader
        title="Fill in the blanks"
        meta={queue && (importId ? `${people.length} from your import` : peopleCount(queue.count))}
        actions={
          <Button asChild variant="ghost">
            <Link to="/people">Finish later</Link>
          </Button>
        }
      />
      {queue && (
        <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
          <ol aria-label="Who's next" className="hidden flex-col gap-1 md:flex">
            {people.map((person, index) => {
              const state = done.has(person.id) ? 'Done' : index === position ? 'Now' : ''
              return (
                <li
                  key={person.id}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-card px-3 py-2 type-small',
                    state === 'Now' ? 'bg-card font-medium text-ink' : 'text-ink-soft',
                  )}
                >
                  <span className="truncate">{person.name}</span>
                  {state && <span className="type-meta text-ink-faint">{state}</span>}
                </li>
              )
            })}
          </ol>
          <div className="flex min-w-0 flex-col gap-3">
            {current ? (
              <>
                <p className="type-meta text-ink-faint">
                  {position + 1} of {people.length}
                </p>
                <FillInCard
                  key={current.id}
                  person={current}
                  onSaved={() => next(true)}
                  onSkipped={() => next(false)}
                />
              </>
            ) : (
              <div className="flex flex-col items-start gap-3 rounded-card border border-line bg-card p-5">
                <p className="type-title">All done</p>
                {more > 0 && (
                  <>
                    <p className="type-small text-ink-soft">{more} more need details</p>
                    <Button onClick={() => void keepGoing()}>Keep going</Button>
                  </>
                )}
                <Button asChild variant="secondary">
                  <Link to="/people">Back to People</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
