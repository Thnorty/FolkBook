import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { CheckboxField } from '@/components/ui/checkbox-field'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { peopleCount } from './labels'
import { membersQuery, type Space } from './queries'

type SharedSpaceConfirmProps = {
  space: Space
  /** Who's being added, e.g. "Tom Bergqvist"; or `count` people at once (an import). */
  personName?: string
  count?: number
  onConfirm: (dontAskAgain: boolean) => void
  onCancel: () => void
}

/** "Tom will be visible to 4 people", the first time someone goes into a shared space (4j, 4k). */
export function SharedSpaceConfirm({
  space,
  personName = '',
  count,
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
      title={`${count === undefined ? firstName : peopleCount(count)} will be visible to ${peopleCount(space.member_count)}`}
      description={
        count === undefined
          ? `They'll see ${firstName}'s basic profile and links to people in ${space.name}. Your notes and memory aids stay private.`
          : `They'll see their basic profiles and links to people in ${space.name}. Your notes and memory aids stay private.`
      }
      confirmLabel={`Add ${count === undefined ? firstName : 'them'} to ${space.name}`}
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
      <CheckboxField checked={remember} onChange={setRemember} className="mt-4 type-small">
        Don&apos;t ask again for {space.name}
      </CheckboxField>
    </ConfirmDialog>
  )
}
