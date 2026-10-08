import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Choice } from '@/components/ui/choice'
import { SharedSpaceConfirm } from '@/features/spaces/SharedSpaceConfirm'
import { spacesQuery, type Space } from '@/features/spaces/queries'
import { useDismissed } from '@/lib/useDismissed'
import type { ContactMatch } from './queries'
import { WizardBar } from './WizardBar'

type SpaceStepProps = {
  newPeople: string[]
  merges: ContactMatch[]
  space: string | null
  onSpace: (spaceId: string | null) => void
  onBack: () => void
  onImport: () => void
  busy: boolean
  error?: string
}

/** Step 4 (screen 4s): optionally put the new people in one of your spaces. */
export function SpaceStep({
  newPeople,
  merges,
  space,
  onSpace,
  onBack,
  onImport,
  busy,
  error,
}: SpaceStepProps) {
  const spaces = (useQuery(spacesQuery).data?.items ?? []).filter(
    (item) => item.role === 'owner' || item.role === 'editor',
  )
  const [askFor, setAskFor] = useState<Space | null>(null)
  // The same "don't ask again" as the person form's.
  const [confirmedShared, dontAskAgain] = useDismissed('folkbook.sharedSpaceConfirmed')
  const count = newPeople.length

  const choose = (item: Space) => {
    if (item.member_count > 0 && !confirmedShared.includes(item.id)) setAskFor(item)
    else onSpace(item.id)
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="type-title">
          {count === 0
            ? 'Nobody new to add'
            : count === 1
              ? 'Put the new person in a space?'
              : `Put the ${count} new people in a space?`}
        </h2>
        {count > 0 && (
          <p className="type-small text-ink-soft">Optional. You can change it per person later.</p>
        )}
      </div>
      {count > 0 && (
        <div role="radiogroup" aria-label="Space" className="flex flex-wrap gap-2">
          {spaces.map((item) => (
            <Choice
              key={item.id}
              name="space"
              checked={space === item.id}
              onChange={() => choose(item)}
            >
              <span data-space={item.color} className="mr-2 size-2 rounded-full bg-space" />
              {item.name}
            </Choice>
          ))}
          <Choice name="space" checked={space === null} onChange={() => onSpace(null)}>
            No space
          </Choice>
        </div>
      )}
      <ul className="flex flex-col gap-1 type-small text-ink-soft">
        {newPeople.map((name, index) => (
          <li key={index}>{name}</li>
        ))}
        {merges.map((match) => (
          <li key={match.person.id} className="type-meta text-ink-faint">
            + {match.person.name}, merged
            {match.spaces.length > 0 &&
              ` — keeps ${match.spaces.map((item) => item.name).join(', ')}`}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="type-small text-danger">
          {error}
        </p>
      )}
      <WizardBar>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        {(count > 0 || merges.length > 0) && (
          <Button disabled={busy} onClick={onImport}>
            {count === 0
              ? `Merge ${merges.length}`
              : `Import ${count === 1 ? '1 person' : `${count} people`}`}
          </Button>
        )}
      </WizardBar>
      {askFor && (
        <SharedSpaceConfirm
          space={askFor}
          count={count}
          onCancel={() => setAskFor(null)}
          onConfirm={(remember) => {
            if (remember) dontAskAgain(askFor.id)
            onSpace(askFor.id)
            setAskFor(null)
          }}
        />
      )}
    </div>
  )
}
