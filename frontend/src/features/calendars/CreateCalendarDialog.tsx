import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { FormDialog, FormDialogFooter } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SpacePicker } from '@/features/spaces/SpacePicker'
import { useCopy } from '@/lib/useCopy'
import { useCreateShownOnce } from '@/lib/useCreateShownOnce'
import { createCalendarFeed, type CalendarFeedIn } from './queries'

const FORM_ID = 'calendar-feed-form'
/**
 * Make a calendar link, then show it once. The link is kept only in this dialog's state:
 * closing it forgets the link, and nothing caches the answer that holds it.
 */
export function CreateCalendarDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { created, settled, pending, error, send, close } = useCreateShownOnce(
    (body: CalendarFeedIn) => createCalendarFeed(queryClient, body),
    onClose,
  )

  return (
    <FormDialog
      small
      title={created ? 'Calendar link created' : 'New calendar link'}
      formId={FORM_ID}
      submitLabel={created ? 'Done' : 'Create'}
      busy={pending || (created !== null && !settled)}
      open={open}
      onClose={close}
      // A stray tap beside the shown-once link would lose it; ✕ and Esc still close.
      closeOnOutsideClick={!created}
    >
      {created ? (
        <LinkCreated url={created.url} settled={settled} onDone={onClose} />
      ) : (
        <LinkForm busy={pending} error={error} onSubmit={send} onCancel={close} />
      )}
    </FormDialog>
  )
}

type LinkFormProps = {
  busy: boolean
  error?: string
  onSubmit: (body: CalendarFeedIn) => void
  onCancel: () => void
}

function LinkForm({ busy, error, onSubmit, onCancel }: LinkFormProps) {
  const [name, setName] = useState('')
  // No space ticked means everyone, so the form never asks for a link with nobody.
  const [spaceIds, setSpaceIds] = useState<string[]>([])
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // The name as typed: the server trims it, and says why a blank one won't do.
    onSubmit({ name, space_ids: spaceIds.length > 0 ? spaceIds : null })
  }

  return (
    <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-5">
      <div>
        <Label htmlFor="calendar-feed-name">Name</Label>
        <Input
          id="calendar-feed-name"
          required
          maxLength={60}
          autoFocus
          autoComplete="off"
          placeholder="Family"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <SpacePicker
        legend="Whose birthdays"
        allLabel="Everyone you can see"
        value={spaceIds}
        onChange={setSpaceIds}
      />
      {error && <p className="type-small text-danger">{error}</p>}
      <FormDialogFooter small submitLabel="Create link" busy={busy} onCancel={onCancel} />
    </form>
  )
}

type LinkCreatedProps = { url: string; settled: boolean; onDone: () => void }

function LinkCreated({ url, settled, onDone }: LinkCreatedProps) {
  const field = useRef<HTMLInputElement>(null)
  const { copied, copy } = useCopy(url)
  const done = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (settled) onDone()
  }

  return (
    <form id={FORM_ID} onSubmit={done} className="flex flex-col gap-4">
      <p className="type-small">
        <strong className="font-semibold">You won&apos;t see this link again.</strong> Add it to
        your calendar now; make a new one if you lose it.
      </p>
      <div className="flex flex-col gap-2 md:flex-row">
        <Input
          ref={field}
          readOnly
          value={url}
          aria-label="Calendar link"
          className="font-mono text-xs md:text-sm"
          onFocus={(event) => event.target.select()}
        />
        <Button type="button" variant="secondary" onClick={() => copy(field.current)}>
          {copied ? 'Copied ✓' : 'Copy'}
        </Button>
      </div>
      <Button asChild variant="secondary" className="md:self-start">
        <a href={url.replace(/^https?:\/\//, 'webcal://')}>Open in your calendar app</a>
      </Button>
      <p className="type-small text-ink-soft">
        Google Calendar: Other calendars → From URL, then paste the link.
      </p>
      <Button type="submit" disabled={!settled} className="h-12 md:h-9 md:self-end">
        I&apos;ve added it
      </Button>
    </form>
  )
}
