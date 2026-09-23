import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { FormDialog } from '@/components/ui/form-dialog'
import { notify } from '@/lib/notify'
import { InteractionForm, type InteractionFormResult } from './InteractionForm'
import { loggedSummary } from './labels'
import {
  addMemoryAid,
  deleteInteraction,
  logInteraction,
  personQuery,
  removeMemoryAid,
  updateInteraction,
  type Interaction,
  type MemoryAid,
} from './queries'
import { InteractionFormContext } from './useInteractionForm'

const FORM_ID = 'interaction-form'

type Open = { personId: string; interaction?: Interaction }

/** Makes the log form available anywhere below it (useInteractionForm). */
export function InteractionFormProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open | null>(null)
  const controls = useMemo(
    () => ({
      openLog: (personId: string) => setOpen({ personId }),
      openEntry: (interaction: Interaction) =>
        setOpen({ personId: interaction.person_id, interaction }),
    }),
    [],
  )

  return (
    <InteractionFormContext.Provider value={controls}>
      {children}
      {open && <InteractionDialog {...open} onClose={() => setOpen(null)} />}
    </InteractionFormContext.Provider>
  )
}

function InteractionDialog({ personId, interaction, onClose }: Open & { onClose: () => void }) {
  const queryClient = useQueryClient()
  const person = useQuery(personQuery(personId)).data
  const firstName = person?.name.split(' ')[0] ?? ''

  const save = useMutation({
    mutationFn: async ({ fields, memoryAids }: InteractionFormResult) => {
      const saved = interaction
        ? await updateInteraction(queryClient, interaction.id, fields)
        : await logInteraction(queryClient, { person_id: personId, ...fields })
      const aids: MemoryAid[] = []
      for (const text of memoryAids) aids.push(await addMemoryAid(queryClient, personId, text))
      return { saved, aids }
    },
    onSuccess: ({ saved, aids }) => {
      onClose()
      if (interaction) return
      notify({
        title: `Logged: ${loggedSummary(saved, firstName)}`,
        description: aids.length > 0 ? `And ${stickyNotes(aids.length)} on Remember` : undefined,
        action: {
          label: 'Undo',
          onClick: () => void undo(() => undoLog(queryClient, saved, aids)),
        },
      })
    },
  })

  const remove = useMutation({
    mutationFn: (entry: Interaction) => deleteInteraction(queryClient, entry.id),
    onSuccess: (_, entry) => {
      onClose()
      notify({
        title: `Removed from ${firstName}'s timeline`,
        action: {
          label: 'Undo',
          onClick: () => void undo(() => relog(queryClient, entry)),
        },
      })
    },
  })

  return (
    <FormDialog
      small
      title={interaction ? 'Edit entry' : `Log with ${firstName}`}
      formId={FORM_ID}
      submitLabel="Save"
      busy={save.isPending || remove.isPending}
      onClose={onClose}
    >
      {person ? (
        <InteractionForm
          formId={FORM_ID}
          interaction={interaction}
          firstName={firstName}
          saving={save.isPending}
          error={(save.error ?? remove.error)?.message}
          onSubmit={(result) => save.mutate(result)}
          onCancel={onClose}
          onDelete={interaction && (() => remove.mutate(interaction))}
        />
      ) : (
        <p className="py-8 text-center text-ink-soft">Opening…</p>
      )}
    </FormDialog>
  )
}

const stickyNotes = (count: number) => (count === 1 ? 'a sticky note' : `${count} sticky notes`)

async function undoLog(queryClient: QueryClient, entry: Interaction, aids: MemoryAid[]) {
  await deleteInteraction(queryClient, entry.id)
  await Promise.all(aids.map((aid) => removeMemoryAid(queryClient, entry.person_id, aid.id)))
}

function relog(
  queryClient: QueryClient,
  { person_id, kind, label, occurred_on, note }: Interaction,
) {
  return logInteraction(queryClient, { person_id, kind, label, occurred_on, note })
}

async function undo(action: () => Promise<unknown>) {
  try {
    await action()
  } catch (error) {
    notify({ title: "Couldn't undo that", description: (error as Error).message })
  }
}
