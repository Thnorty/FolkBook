import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { CheckboxField } from '@/components/ui/checkbox-field'
import { Choice } from '@/components/ui/choice'
import { FormDialog, FormDialogFooter } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { Label, labelClass } from '@/components/ui/label'
import { spacesQuery } from '@/features/spaces/queries'
import { formatDay } from '@/lib/dates'
import { useCopy } from '@/lib/useCopy'
import { createApiKey, type ApiKeyIn, type CreatedApiKey } from './queries'
import { scopeSummary } from './scope'

const FORM_ID = 'api-key-form'
/** How long the new key stays put before a submit can close it: the press (or the second tap
 * of a double tap) that made the key mustn't also close it, unseen. */
const SETTLE_MS = 500
const SCOPES = [
  { readOnly: true, label: 'Read-only', note: 'Look up people and links' },
  { readOnly: false, label: 'Read-write', note: 'Also add and edit people' },
]
const EXPIRES: { value: NonNullable<ApiKeyIn['expires_in']>; label: string }[] = [
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '1y', label: '1 year' },
  { value: 'never', label: 'Never' },
]

/**
 * Create an API key (screen 5p), then show it once (5q, 5z). The key is kept only in this
 * dialog's state: closing it forgets the key, and nothing caches the answer that holds it.
 */
export function CreateKeyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [created, setCreated] = useState<CreatedApiKey | null>(null)
  // Ctrl/⌘+Enter submits with requestSubmit(), which a disabled button doesn't stop.
  const sent = useRef(false)
  const create = useMutation({
    // The answer holds the key, so it goes into this dialog's state and the mutation keeps
    // nothing: the mutation cache outlives the dialog.
    mutationFn: async (body: ApiKeyIn) => setCreated(await createApiKey(queryClient, body)),
    onError: () => (sent.current = false),
  })
  const send = (body: ApiKeyIn) => {
    if (sent.current) return
    sent.current = true
    create.mutate(body)
  }
  // Closing while the key is being made would make a key nobody ever sees.
  const close = () => {
    if (!create.isPending) onClose()
  }
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    if (!created) return
    const timer = setTimeout(() => setSettled(true), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [created])

  return (
    <FormDialog
      small
      title={created ? 'Key created' : 'Create API key'}
      formId={FORM_ID}
      submitLabel={created ? 'Done' : 'Create'}
      busy={create.isPending || (created !== null && !settled)}
      open={open}
      onClose={close}
      // A stray tap beside the shown-once key would lose it; ✕ and Esc still close.
      closeOnOutsideClick={!created}
    >
      {created ? (
        <KeyCreated created={created} settled={settled} onDone={onClose} />
      ) : (
        <KeyForm
          busy={create.isPending}
          error={create.error?.message}
          onSubmit={send}
          onCancel={close}
        />
      )}
    </FormDialog>
  )
}

type KeyFormProps = {
  busy: boolean
  error?: string
  onSubmit: (body: ApiKeyIn) => void
  onCancel: () => void
}

function KeyForm({ busy, error, onSubmit, onCancel }: KeyFormProps) {
  const spaces = useQuery(spacesQuery).data?.items ?? []
  const [name, setName] = useState('')
  const [readOnly, setReadOnly] = useState(true)
  // No space ticked means all spaces, so the form never asks for a key with none.
  const [spaceIds, setSpaceIds] = useState<string[]>([])
  const [includePrivate, setIncludePrivate] = useState(false)
  const [expiresIn, setExpiresIn] = useState<NonNullable<ApiKeyIn['expires_in']>>('90d')

  const toggle = (spaceId: string) =>
    setSpaceIds((ids) =>
      ids.includes(spaceId) ? ids.filter((id) => id !== spaceId) : [...ids, spaceId],
    )
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit({
      name, // as typed: the server trims it, and says why a blank one won't do
      read_only: readOnly,
      include_private: includePrivate,
      space_ids: spaceIds.length > 0 ? spaceIds : null,
      expires_in: expiresIn,
    })
  }

  return (
    <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-5">
      <div>
        <Label htmlFor="api-key-name">Name</Label>
        <Input
          id="api-key-name"
          required
          maxLength={60}
          autoFocus
          autoComplete="off"
          placeholder="Obsidian sync"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <fieldset>
        <legend className={labelClass}>Scope</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {SCOPES.map((scope) => (
            <Choice
              key={scope.label}
              name="scope"
              look="box"
              checked={readOnly === scope.readOnly}
              onChange={() => setReadOnly(scope.readOnly)}
            >
              <span className="flex w-full flex-col items-start text-left">
                <span className="text-ink">{scope.label}</span>
                <span className="type-meta font-normal text-ink-faint">{scope.note}</span>
              </span>
            </Choice>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className={labelClass}>Limited to spaces</legend>
        <div className="flex flex-wrap gap-1.5">
          {spaces.map((space) => (
            <Choice
              key={space.id}
              name="spaces"
              type="checkbox"
              checked={spaceIds.includes(space.id)}
              onChange={() => toggle(space.id)}
            >
              {space.name}
            </Choice>
          ))}
          <Choice
            name="spaces"
            type="checkbox"
            checked={spaceIds.length === 0}
            onChange={() => setSpaceIds([])}
          >
            All spaces
          </Choice>
        </div>
      </fieldset>
      <CheckboxField
        checked={includePrivate}
        onChange={setIncludePrivate}
        note="Off by default. Only yours — never what other members write."
        className="rounded-card border border-line bg-card p-3"
      >
        Include my private notes, memory aids and timeline
      </CheckboxField>
      <fieldset>
        <legend className={labelClass}>Expires</legend>
        <div className="grid grid-cols-4 gap-1.5">
          {EXPIRES.map((option) => (
            <Choice
              key={option.value}
              name="expires"
              look="box"
              checked={expiresIn === option.value}
              onChange={() => setExpiresIn(option.value)}
            >
              {option.label}
            </Choice>
          ))}
        </div>
      </fieldset>
      {error && <p className="type-small text-danger">{error}</p>}
      <FormDialogFooter small submitLabel="Create key" busy={busy} onCancel={onCancel} />
    </form>
  )
}

type KeyCreatedProps = { created: CreatedApiKey; settled: boolean; onDone: () => void }

function KeyCreated({ created, settled, onDone }: KeyCreatedProps) {
  const field = useRef<HTMLInputElement>(null)
  const { copied, copy } = useCopy(created.key)
  const done = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (settled) onDone()
  }

  return (
    <form id={FORM_ID} onSubmit={done} className="flex flex-col gap-4">
      <div className="flex gap-3 rounded-card border border-line bg-card p-3">
        <span
          aria-hidden
          className="flex size-6 flex-none items-center justify-center rounded-full bg-accent font-semibold text-on-accent"
        >
          !
        </span>
        <p className="type-small">
          <strong className="font-semibold">Copy it now — you won&apos;t see it again.</strong> If
          you lose it, revoke it and make a new one.
        </p>
      </div>
      <p className="type-small text-ink-soft">{scopeSummary(created)}</p>
      <div className="flex flex-col gap-2 md:flex-row">
        <Input
          ref={field}
          readOnly
          value={created.key}
          aria-label="API key"
          className="font-mono text-xs md:text-sm"
          onFocus={(event) => event.target.select()}
        />
        <Button type="button" variant="secondary" onClick={() => copy(field.current)}>
          {copied ? 'Copied ✓' : 'Copy'}
        </Button>
      </div>
      <p className="type-small text-ink-soft">
        {created.expires_at
          ? `Expires ${formatDay(created.expires_at.slice(0, 10))}.`
          : 'Never expires.'}{' '}
        Use it as <code className="font-mono text-ink">Authorization: Bearer …</code>
      </p>
      <Button type="submit" disabled={!settled} className="h-12 md:h-9 md:self-end">
        I&apos;ve saved it
      </Button>
    </form>
  )
}
