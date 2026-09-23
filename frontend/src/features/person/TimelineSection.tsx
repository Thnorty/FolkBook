import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { TimelineItem } from '@/components/notebook/TimelineItem'
import { Button } from '@/components/ui/button'
import { INTERACTION_KINDS } from './labels'
import { ProfileSection } from './ProfileSection'
import { timelineQuery } from './queries'

const FIRST = 5

/** When you met, called or messaged, newest first. Private to you. */
export function TimelineSection({ personId }: { personId: string }) {
  const page = useQuery(timelineQuery(personId)).data
  const [showAll, setShowAll] = useState(false)
  const items = page?.items ?? []
  const shown = showAll ? items : items.slice(0, FIRST)

  return (
    <ProfileSection title="Timeline" meta="private to you">
      {items.length === 0 ? (
        <div className="flex flex-col gap-1">
          <p className="type-hand text-ink-soft">first coffee goes here</p>
          <p className="type-small text-ink-soft">
            Log calls, coffees and messages to see when you last talked.
          </p>
        </div>
      ) : (
        <>
          <ol>
            {shown.map((item) => (
              <TimelineItem
                key={item.id}
                date={item.occurred_on}
                kind={INTERACTION_KINDS[item.kind]}
                title={item.label || INTERACTION_KINDS[item.kind]}
              >
                {item.note || undefined}
              </TimelineItem>
            ))}
          </ol>
          {items.length > FIRST && !showAll && (
            <Button variant="ghost" className="self-start" onClick={() => setShowAll(true)}>
              Show all {page?.count ?? items.length}
            </Button>
          )}
        </>
      )}
    </ProfileSection>
  )
}
