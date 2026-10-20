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
  const added = useAdded(personId, page && items.map((item) => item.id))
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
                time={item.occurred_at}
                kind={INTERACTION_KINDS[item.kind]}
                title={item.label || INTERACTION_KINDS[item.kind]}
                onOpen={() => openEntry(item)}
                stamped={added.has(item.id)}
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

/**
 * The entries that turned up after the timeline first loaded: the ones just logged. Showing
 * more of the list or changing an entry doesn't count; another person starts again.
 */
function useAdded(personId: string, ids: string[] | undefined): ReadonlySet<string> {
  type Seen = { personId: string; ids: ReadonlySet<string>; added: ReadonlySet<string> }
  const [seen, setSeen] = useState<Seen | null>(null)
  if (!ids) return seen?.personId === personId ? seen.added : NONE
  if (seen?.personId !== personId) {
    setSeen({ personId, ids: new Set(ids), added: NONE })
    return NONE
  }
  const fresh = ids.filter((id) => !seen.ids.has(id))
  if (fresh.length === 0) return seen.added
  const added = new Set([...seen.added, ...fresh])
  setSeen({ personId, ids: new Set([...seen.ids, ...fresh]), added })
  return added
}

const NONE: ReadonlySet<string> = new Set()

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
