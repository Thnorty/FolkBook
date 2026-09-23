import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Lock } from 'lucide-react'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type { SpaceColor } from '@/components/notebook/spaces'
import { FormDialog, FormDialogFooter } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { Label, labelClass } from '@/components/ui/label'
import { createSpace, refreshSpaces, spaceQuery, spacesQuery, updateSpace } from './queries'
import { SpaceFormContext } from './useSpaceForm'

const FORM_ID = 'space-form'
const COLORS: SpaceColor[] = ['sage', 'ochre', 'clay', 'plum', 'teal', 'slate']

/** Makes the create / edit space form available anywhere below it (useSpaceForm). */
export function SpaceFormProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<{ spaceId?: string } | null>(null)
  const controls = useMemo(
    () => ({
      openNew: () => setOpen({}),
      openEdit: (spaceId: string) => setOpen({ spaceId }),
    }),
    [],
  )
  return (
    <SpaceFormContext.Provider value={controls}>
      {children}
      {open && <SpaceFormDialog spaceId={open.spaceId} onClose={() => setOpen(null)} />}
    </SpaceFormContext.Provider>
  )
}

function SpaceFormDialog({ spaceId, onClose }: { spaceId?: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const space = useQuery({ ...spaceQuery(spaceId ?? ''), enabled: Boolean(spaceId) })
  const editing = Boolean(spaceId)
  const verb = editing ? 'Save' : 'Create'

  const save = useMutation({
    mutationFn: (input: { name: string; color: SpaceColor; description: string }) =>
      spaceId ? updateSpace(spaceId, input) : createSpace(input),
    onSuccess: async (saved) => {
      await refreshSpaces(queryClient)
      onClose()
      if (!editing) void navigate({ to: '/spaces/$spaceId', params: { spaceId: saved.id } })
    },
  })

  return (
    <FormDialog
      title={editing ? `Edit ${space.data?.name ?? 'space'}` : 'New space'}
      formId={FORM_ID}
      submitLabel={verb}
      busy={save.isPending}
      onClose={onClose}
    >
      {editing && !space.data ? (
        <p className="py-8 text-center text-ink-soft">{space.error?.message ?? 'Opening…'}</p>
      ) : (
        <SpaceForm
          initial={space.data}
          submitLabel={editing ? 'Save space' : 'Create space'}
          saving={save.isPending}
          error={save.error?.message}
          onSubmit={(input) => save.mutate(input)}
          onCancel={onClose}
        />
      )}
    </FormDialog>
  )
}

type SpaceFormProps = {
  initial?: { name: string; color: SpaceColor; description: string }
  submitLabel: string
  saving: boolean
  error?: string
  onSubmit: (input: { name: string; color: SpaceColor; description: string }) => void
  onCancel: () => void
}

/** Name, tab color and an optional description (screens 4f, 4g). */
function SpaceForm({ initial, submitLabel, saving, error, onSubmit, onCancel }: SpaceFormProps) {
  const spaces = useQuery(spacesQuery).data?.items ?? []
  const [name, setName] = useState(initial?.name ?? '')
  const [color, setColor] = useState<SpaceColor>(initial?.color ?? 'sage')
  const [description, setDescription] = useState(initial?.description ?? '')

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit({ name: name.trim(), color, description: description.trim() })
  }

  return (
    <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-5">
      <div>
        <Label htmlFor="space-name">Name</Label>
        <Input
          id="space-name"
          required
          maxLength={100}
          autoFocus
          autoComplete="off"
          placeholder="Climbing club"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <fieldset>
        <legend className={labelClass}>Tab color</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {COLORS.map((option) => {
            const usedBy = spaces
              .filter((space) => space.color === option && space.name !== initial?.name)
              .map((space) => space.name)
            return (
              <label key={option} data-space={option} className="cursor-pointer">
                <input
                  type="radio"
                  name="color"
                  value={option}
                  checked={color === option}
                  onChange={() => setColor(option)}
                  className="peer sr-only"
                />
                <span className="flex flex-col gap-1 rounded-card border border-transparent p-1.5 peer-checked:border-ink peer-focus-visible:outline-2 peer-focus-visible:outline-accent hover:border-line-strong">
                  <span className="rounded-t-tab bg-space px-2 py-1.5 text-md font-medium text-on-space capitalize">
                    {option}
                    {color === option && <span aria-hidden> ✓</span>}
                  </span>
                  <span className="truncate px-0.5 type-meta text-ink-faint">
                    {usedBy.join(', ') || ' ' /* keeps the line's height when unused */}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
        <p className="mt-2 type-small text-ink-faint">
          Colors can repeat — the name is what tells spaces apart.
        </p>
      </fieldset>

      <div>
        <Label htmlFor="space-description">Description · optional</Label>
        <textarea
          id="space-description"
          rows={2}
          maxLength={500}
          placeholder="Tuesday & Thursday nights at Bouldergarten."
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="w-full rounded-card border border-line-input bg-card px-3 py-2.5 text-input outline-none placeholder:text-ink-faint focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-focus-glow"
        />
      </div>

      {!initial && (
        <p className="flex items-start gap-2.5 rounded-card bg-hover px-3.5 py-3 type-small">
          <Lock aria-hidden className="mt-0.5 size-4 flex-none text-ink-soft" />
          <span>
            <strong className="font-medium">Private — only you.</strong>{' '}
            <span className="text-ink-soft">Share it later from the space page.</span>
          </span>
        </p>
      )}

      {error && (
        <p role="alert" className="type-small text-danger">
          {error}
        </p>
      )}

      <FormDialogFooter
        submitLabel={submitLabel}
        busy={saving}
        onCancel={onCancel}
        hint={
          <>
            <Kbd shortcut={{ key: 'Enter', mod: true }} /> {initial ? 'saves' : 'creates'} · Esc
            cancels
          </>
        }
      />
    </form>
  )
}
