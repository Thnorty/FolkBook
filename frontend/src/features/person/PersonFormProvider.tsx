import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useMemo, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
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
    <Dialog.Root open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-30 bg-ink/25" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-30 flex flex-col overflow-hidden bg-paper md:inset-auto md:top-[6vh] md:left-1/2 md:max-h-[88vh] md:w-[calc(100vw-2rem)] md:max-w-xl md:-translate-x-1/2 md:rounded-card md:border md:border-line md:shadow-float"
        >
          {/* Phones: Cancel · title · Save across the top (screen 2b). Desktop: title and ✕. */}
          <div className="flex flex-none items-center gap-2 border-b border-line px-3 py-2 md:px-5 md:py-3">
            <Button variant="ghost" className="md:hidden" onClick={onClose}>
              Cancel
            </Button>
            <Dialog.Title className="flex-1 text-center type-heading md:text-left">
              {title}
            </Dialog.Title>
            <Button
              type="submit"
              form={FORM_ID}
              variant="ghost"
              className="font-semibold text-accent md:hidden"
              disabled={save.isPending}
            >
              Save
            </Button>
            <Dialog.Close asChild>
              <Button variant="ghost" aria-label="Close" className="hidden md:inline-flex">
                <X aria-hidden />
              </Button>
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-5 md:px-5">
            {editing && !person.data ? (
              <p className="py-8 text-center text-ink-soft">
                {person.error?.message ?? 'Opening…'}
              </p>
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
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
