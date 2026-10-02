import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { FormDialog } from '@/components/ui/form-dialog'
import { notify } from '@/lib/notify'
import { useClosing } from '@/motion/useClosing'
import { ConnectionForm, type ConnectionFormResult } from './ConnectionForm'
import { linkFor } from './connectionKinds'
import {
  createPerson,
  createRelationship,
  deleteRelationship,
  personQuery,
  updateRelationship,
  type Relationship,
} from './queries'
import { ConnectionFormContext } from './useConnectionForm'

const FORM_ID = 'connection-form'

type Open = { personId: string; link?: Relationship }

/** Makes the connect form available anywhere below it (useConnectionForm). */
export function ConnectionFormProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open | null>(null)
  const [shown, closing] = useClosing(open)
  const controls = useMemo(
    () => ({
      openConnect: (personId: string) => setOpen({ personId }),
      openChange: (personId: string, link: Relationship) => setOpen({ personId, link }),
    }),
    [],
  )

  return (
    <ConnectionFormContext.Provider value={controls}>
      {children}
      {shown && <ConnectionDialog {...shown} open={!closing} onClose={() => setOpen(null)} />}
    </ConnectionFormContext.Provider>
  )
}

function ConnectionDialog({
  personId,
  link,
  open,
  onClose,
}: Open & { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const person = useQuery(personQuery(personId)).data
  const firstName = person?.name.split(' ')[0] ?? ''
  // Someone created here stays created if linking then fails, so trying again reuses them.
  const created = useRef<{ name: string; id: string } | null>(null)

  const otherIdFor = async (other: ConnectionFormResult['other']) => {
    if ('id' in other) return other.id
    if (created.current?.name !== other.newName) {
      const newPerson = await createPerson({ name: other.newName })
      created.current = { name: other.newName, id: newPerson.id }
    }
    return created.current.id
  }

  const save = useMutation({
    mutationFn: async ({
      other,
      kind,
      parentType,
      label,
      startedOn,
      spaceId,
    }: ConnectionFormResult) => {
      const fields = {
        ...linkFor(kind, personId, await otherIdFor(other)),
        parent_type: parentType,
        label,
        started_on: startedOn,
      }
      return link
        ? updateRelationship(queryClient, link.id, fields)
        : createRelationship(queryClient, { ...fields, space_id: spaceId })
    },
    onSuccess: (saved) => {
      onClose()
      if (link) return
      const other = saved.person_a.id === personId ? saved.person_b : saved.person_a
      notify({
        title: `${other.name} connected to ${firstName}`,
        action: {
          label: 'Undo',
          onClick: () =>
            void deleteRelationship(queryClient, saved.id).catch((error: Error) =>
              notify({ title: "Couldn't undo that", description: error.message }),
            ),
        },
      })
    },
  })

  return (
    <FormDialog
      small
      title={link ? 'Change how they’re connected' : `Connect ${firstName} to…`}
      formId={FORM_ID}
      submitLabel={link ? 'Save' : 'Connect'}
      busy={save.isPending}
      open={open}
      onClose={onClose}
    >
      {person ? (
        <ConnectionForm
          formId={FORM_ID}
          person={person}
          link={link}
          saving={save.isPending}
          error={save.error?.message}
          onSubmit={(result) => save.mutate(result)}
          onCancel={onClose}
        />
      ) : (
        <p className="py-8 text-center text-ink-soft">Opening…</p>
      )}
    </FormDialog>
  )
}
