import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { CheckboxField } from '@/components/ui/checkbox-field'
import { Choice } from '@/components/ui/choice'
import { FormDialog, FormDialogFooter } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { Label, labelClass } from '@/components/ui/label'
import { SpacePicker } from '@/features/spaces/SpacePicker'
import { formatDay } from '@/lib/dates'
import { useCopy } from '@/lib/useCopy'
import { useCreateShownOnce } from '@/lib/useCreateShownOnce'
import { createApiKey, type ApiKeyIn, type CreatedApiKey } from './queries'
import { scopeSummary } from './scope'

const FORM_ID = 'api-key-form'
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
  const { created, settled, pending, error, send, close } = useCreateShownOnce(
    (body: ApiKeyIn) => createApiKey(queryClient, body),
    onClose,
  )

  return (
    <FormDialog
      small
      title={created ? 'Key created' : 'Create API key'}
      formId={FORM_ID}
      submitLabel={created ? 'Done' : 'Create'}
      busy={pending || (created !== null && !settled)}
      open={open}
      onClose={close}
      // A stray tap beside the shown-once key would lose it; ✕ and Esc still close.
      closeOnOutsideClick={!created}
    >
      {created ? (
        <KeyCreated created={created} settled={settled} onDone={onClose} />
      ) : (
        <KeyForm busy={pending} error={error} onSubmit={send} onCancel={close} />
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
  const [name, setName] = useState('')
  const [readOnly, setReadOnly] = useState(true)
  // No space ticked means all spaces, so the form never asks for a key with none.
  const [spaceIds, setSpaceIds] = useState<string[]>([])
  const [includePrivate, setIncludePrivate] = useState(false)
  const [expiresIn, setExpiresIn] = useState<NonNullable<ApiKeyIn['expires_in']>>('90d')

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
      <SpacePicker
        legend="Limited to spaces"
        allLabel="All spaces"
        value={spaceIds}
        onChange={setSpaceIds}
      />
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
