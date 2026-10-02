import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Choice, pickedBoxClass } from '@/components/ui/choice'
import { FormDialog, FooterNote, FormDialogFooter } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { labelClass } from '@/components/ui/label'
import { isoDay } from '@/lib/dates'
import { notify } from '@/lib/notify'
import { cn } from '@/lib/utils'
import { linkLabel, relationLabel } from './labels'
import { endPreviewQuery, endRelationship, reopenRelationship, type Relationship } from './queries'

const FORM_ID = 'end-connection'
const NOUNS: Partial<Record<Relationship['type'], string>> = {
  partner: 'partnership',
  friend: 'friendship',
}

type EndConnectionDialogProps = {
  /** The person whose profile this is. */
  personId: string
  personName: string
  link: Relationship
  /** False while it animates out. */
  open?: boolean
  onClose: () => void
}

/** End a link without deleting it: it becomes "former" (screen 2m). */
export function EndConnectionDialog({
  personId,
  personName,
  link,
  open = true,
  onClose,
}: EndConnectionDialogProps) {
  const queryClient = useQueryClient()
  const other = link.person_a.id === personId ? link.person_b : link.person_a
  const [first, otherFirst] = [personName, other.name].map((name) => name.split(' ')[0])
  const noun = NOUNS[link.type] ?? 'connection'
  const moving = useQuery(endPreviewQuery(personId, link.id)).data ?? []
  const [endedOn, setEndedOn] = useState('')

  const end = useMutation({
    mutationFn: () => endRelationship(queryClient, link.id, endedOn || null),
    onSuccess: () => {
      onClose()
      notify({
        title: `${first} and ${otherFirst}'s ${noun} ended`,
        description: 'It stays in the Former group.',
        action: {
          label: 'Undo',
          onClick: () =>
            void reopenRelationship(queryClient, link.id).catch((error: Error) =>
              notify({ title: "Couldn't undo that", description: error.message }),
            ),
        },
      })
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    end.mutate()
  }

  return (
    <FormDialog
      small
      title={`End ${first} and ${otherFirst}'s ${noun}`}
      formId={FORM_ID}
      submitLabel="Mark as former"
      busy={end.isPending}
      open={open}
      onClose={onClose}
    >
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-ink-soft">
          Nothing is deleted. The link becomes{' '}
          <strong className="font-medium text-ink">former {linkLabel(link)}</strong>
          {link.type === 'partner' &&
            `, and anyone who was family only through ${otherFirst} moves to a “Former” group on ${first}'s page`}
          .
        </p>

        <fieldset>
          <legend className={labelClass}>Ended</legend>
          <div className="flex gap-1.5">
            <Input
              type="date"
              aria-label="Ended on"
              value={endedOn}
              max={isoDay()}
              onChange={(event) => setEndedOn(event.target.value)}
              className={cn('w-auto flex-none', endedOn && pickedBoxClass)}
            />
            <Choice name="ended" look="box" checked={!endedOn} onChange={() => setEndedOn('')}>
              Don&apos;t know
            </Choice>
          </div>
        </fieldset>

        {moving.length > 0 && (
          <div>
            <h3 className={labelClass}>This will also move</h3>
            <ul className="flex flex-col gap-1">
              {moving.map((relation) => (
                <li key={`${relation.person.id}-${relation.relation}`}>
                  <span className="font-serif text-lg">{relation.person.name}</span>
                  <span className="text-ink-soft">
                    {' '}
                    — former {relationLabel(relation.relation, relation.pronouns)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {end.error && <p className="type-small text-danger">{end.error.message}</p>}

        <FormDialogFooter
          small
          submitLabel="Mark as former"
          busy={end.isPending}
          onCancel={onClose}
          start={<FooterNote>Parent links never end.</FooterNote>}
        />
      </form>
    </FormDialog>
  )
}
