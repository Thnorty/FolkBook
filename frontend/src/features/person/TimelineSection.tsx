import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useCallback, useState } from 'react'
import { SHORTCUTS } from '@/app/nav'
import { TimelineItem } from '@/components/notebook/TimelineItem'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { useShortcut } from '@/lib/shortcuts'
import { INTERACTION_KINDS } from './labels'
import { ProfileSection } from './ProfileSection'
import { timelineQuery } from './queries'
import { useInteractionForm } from './useInteractionForm'

const FIRST = 5

type TimelineSectionProps = {
  personId: string
  /** Not on your own page: you don't log talking to yourself. */
  canLog: boolean
}

/** When you met, called or messaged, newest first. Private to you. */
export function TimelineSection({ personId, canLog }: TimelineSectionProps) {
  const page = useQuery(timelineQuery(personId)).data
  const { openEntry } = useInteractionForm()
  const [showAll, setShowAll] = useState(false)
  const items = page?.items ?? []
  const shown = showAll ? items : items.slice(0, FIRST)

  return (
    <ProfileSection
      title="Timeline"
      meta="private to you"
      action={canLog && <LogButton personId={personId} />}
    >
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
                onOpen={() => openEntry(item)}
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

/** "+ Log", also on the L key while their page is open. */
function LogButton({ personId }: { personId: string }) {
  const { openLog } = useInteractionForm()
  const open = useCallback(() => openLog(personId), [openLog, personId])
  useShortcut(SHORTCUTS.logInteraction, open)

  return (
    <Button variant="ghost" onClick={open} aria-keyshortcuts="L">
      <Plus aria-hidden />
      Log
      <Kbd shortcut={SHORTCUTS.logInteraction} className="hidden text-ink-faint md:inline" />
    </Button>
  )
}
