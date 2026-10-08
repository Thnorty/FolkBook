import { useQuery } from '@tanstack/react-query'
import { Link, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { peopleCount } from '@/features/spaces/labels'
import { cn } from '@/lib/utils'
import { FillInCard } from './FillInCard'
import { fillInQueueQuery, PAGE_SIZE } from './queries'

/**
 * Fill in the blanks (screens 4v, 4w): one person at a time, from an import (`?import=`)
 * or everyone under Needs details. Skipped people stay as they were, for next time.
 */
export function FillInPage() {
  const { import: importId } = useSearch({ from: '/app/people/fill-in' })
  const [page, setPage] = useState(1)
  const queue = useQuery(fillInQueueQuery(importId, page))
  const [position, setPosition] = useState(0)
  const [done, setDone] = useState<ReadonlySet<string>>(new Set())
  // Everyone shown in earlier batches, and how many of them were skipped: they still need
  // details, so a later page lists them again, before anyone new.
  const [seenBefore, setSeenBefore] = useState<ReadonlySet<string>>(new Set())
  const [skippedBefore, setSkippedBefore] = useState(0)

  const people = (queue.data?.items ?? []).filter((person) => !seenBefore.has(person.id))
  const current = people[position]
  const next = (personId: string, saved: boolean) => {
    if (personId !== current?.id) return // a late answer about someone already gone by
    if (saved) setDone((ids) => new Set(ids).add(personId))
    setPosition((at) => at + 1)
  }
  const skipped = skippedBefore + people.length - done.size
  const more = (queue.data?.count ?? 0) - skippedBefore - people.length
  const keepGoing = () => {
    setSeenBefore(new Set([...seenBefore, ...people.map((person) => person.id)]))
    setSkippedBefore(skipped)
    // Saved people have left the list; the skipped ones come first, then the unseen.
    setPage(Math.floor(skipped / PAGE_SIZE) + 1)
    setPosition(0)
    setDone(new Set())
  }
  const back = importId ? {} : { needs: true }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 md:px-8">
      <PageHeader
        title="Fill in the blanks"
        meta={
          queue.data &&
          (importId ? `${queue.data.count} from your import` : peopleCount(queue.data.count))
        }
        actions={
          <Button asChild variant="ghost">
            <Link to="/people" search={back}>
              Finish later
            </Link>
          </Button>
        }
      />
      {queue.isPending && <p className="text-ink-soft">Finding who needs details…</p>}
      {queue.error && (
        <p role="alert" className="text-danger">
          {queue.error.message}
        </p>
      )}
      {queue.data && (
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
                  onSaved={() => next(current.id, true)}
                  onSkipped={() => next(current.id, false)}
                />
              </>
            ) : (
              <div className="flex flex-col items-start gap-3 rounded-card border border-line bg-card p-5">
                <p className="type-title">All done</p>
                {more > 0 && (
                  <>
                    <p className="type-small text-ink-soft">{more} more need details</p>
                    <Button onClick={keepGoing}>Keep going</Button>
                  </>
                )}
                <Button asChild variant="secondary">
                  <Link to="/people" search={back}>
                    Back to People
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
