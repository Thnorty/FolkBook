import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState, type ReactNode } from 'react'
import { FormDialog } from '@/components/ui/form-dialog'
import { notify } from '@/lib/notify'
import { removePhoto, uploadPhoto } from './photo'
import { PersonForm, type PersonFormResult } from './PersonForm'
import { createPerson, personQuery, refreshPeople, updatePerson } from './queries'
import { PersonFormContext } from './usePersonForm'

const FORM_ID = 'person-form'

/** Makes the add / edit person form available anywhere below it (usePersonForm). */
export function PersonFormProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<{ personId?: string } | null>(null)
  const controls = useMemo(
    () => ({
      openNew: () => setOpen({}),
      openEdit: (personId: string) => setOpen({ personId }),
    }),
    [],
  )

  return (
    <PersonFormContext.Provider value={controls}>
      {children}
      {open && <PersonFormDialog personId={open.personId} onClose={() => setOpen(null)} />}
    </PersonFormContext.Provider>
  )
}

function PersonFormDialog({ personId, onClose }: { personId?: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const person = useQuery({ ...personQuery(personId ?? ''), enabled: Boolean(personId) })
  const editing = Boolean(personId)
  const title = editing ? `Edit ${person.data?.name ?? 'person'}` : 'Add someone'

  const save = useMutation({
    mutationFn: async ({ fields, photo }: PersonFormResult) => {
      const saved = personId ? await updatePerson(personId, fields) : await createPerson(fields)
      if (photo.kind === 'new') return uploadPhoto(saved.id, await photo.crop)
      if (photo.kind === 'remove') return removePhoto(saved.id)
      return saved
    },
    onSuccess: async (saved) => {
      await refreshPeople(queryClient)
      onClose()
      if (!editing) {
        notify({ title: `${saved.name} added` })
        void navigate({ to: '/people/$personId', params: { personId: saved.id } })
      }
    },
  })

  return (
    <FormDialog
      title={title}
      formId={FORM_ID}
      submitLabel="Save"
      busy={save.isPending}
      onClose={onClose}
    >
      {editing && !person.data ? (
        <p className="py-8 text-center text-ink-soft">{person.error?.message ?? 'Opening…'}</p>
      ) : (
        <PersonForm
          formId={FORM_ID}
          person={person.data}
          saving={save.isPending}
          error={save.error?.message}
          onSubmit={(result) => save.mutate(result)}
          onCancel={onClose}
        />
      )}
    </FormDialog>
  )
}
