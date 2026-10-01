import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { peopleCount } from './labels'
import { membersQuery, type Space } from './queries'

type SharedSpaceConfirmProps = {
  space: Space
  /** Who's being added, e.g. "Tom Bergqvist". */
  personName: string
  onConfirm: (dontAskAgain: boolean) => void
  onCancel: () => void
}

/** "Tom will be visible to 4 people", the first time someone goes into a shared space (4j, 4k). */
export function SharedSpaceConfirm({
  space,
  personName,
  onConfirm,
  onCancel,
}: SharedSpaceConfirmProps) {
  const others = (useQuery(membersQuery(space.id)).data ?? []).filter((member) => !member.is_you)
  const [remember, setRemember] = useState(false)
  const firstName = personName.split(' ')[0]

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onCancel()}
      tone="plain"
      title={`${firstName} will be visible to ${peopleCount(space.member_count)}`}
      description={`They'll see ${firstName}'s basic profile and links to people in ${space.name}. Your notes and memory aids stay private.`}
      confirmLabel={`Add ${firstName} to ${space.name}`}
      onConfirm={() => onConfirm(remember)}
    >
      {others.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1 rounded-card border border-line bg-card px-4 py-3 type-small">
          {others.map((member) => (
            <li key={member.user_id} className="flex gap-2">
              {member.name}
              <span className="ml-auto text-ink-faint">{member.role}</span>
            </li>
          ))}
        </ul>
      )}
      <label className="mt-4 flex items-center gap-2.5 type-small">
        <input
          type="checkbox"
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
          className="size-4 accent-accent"
        />
        Don&apos;t ask again for {space.name}
      </label>
    </ConfirmDialog>
  )
}
