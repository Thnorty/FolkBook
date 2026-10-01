import { Plus, Trash2, X } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Choice, pickedBoxClass } from '@/components/ui/choice'
import { FormDialogFooter } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { labelClass } from '@/components/ui/label'
import { isoDay } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { INTERACTION_KINDS } from './labels'
import { memoryLine } from './memoryLine'
import type { Interaction, InteractionInput } from './queries'

/** What the form hands back: the entry, and sticky notes to add from its note. */
export type InteractionFormResult = {
  fields: Omit<InteractionInput, 'person_id'>
  memoryAids: string[]
}

type InteractionFormProps = {
  /** The entry being changed; nothing when logging a new one. */
  interaction?: Interaction
  firstName: string
  formId: string
  saving: boolean
  error?: string
  onSubmit: (result: InteractionFormResult) => void
  onCancel: () => void
  /** Offered when changing an entry. */
  onDelete?: () => void
}

const KINDS = Object.keys(INTERACTION_KINDS) as Interaction['kind'][]

/** Log a call, coffee or message, or change one (screens 2o, 2p). */
export function InteractionForm({
  interaction,
  firstName,
  formId,
  saving,
  error,
  onSubmit,
  onCancel,
  onDelete,
}: InteractionFormProps) {
  const today = isoDay()
  const yesterday = isoDay(1)
  const [kind, setKind] = useState(interaction?.kind ?? 'met')
  const [label, setLabel] = useState(interaction?.label ?? '')
  const [day, setDay] = useState(interaction?.occurred_on ?? today)
  const [note, setNote] = useState(interaction?.note ?? '')
  const [memoryAids, setMemoryAids] = useState<string[]>([])
  const noteBox = useRef<HTMLTextAreaElement>(null)

  const keepLine = () => {
    const box = noteBox.current
    if (!box) return
    const line = memoryLine(note, box.selectionStart, box.selectionEnd)
    if (line && !memoryAids.includes(line)) setMemoryAids([...memoryAids, line])
    box.focus()
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit({
      fields: {
        kind,
        // Only "Other" is named here; other kinds keep a name given elsewhere (e.g. an import).
        label: kind === 'custom' ? label.trim() : (interaction?.label ?? ''),
        occurred_on: day,
        note: note.trim(),
      },
      memoryAids,
    })
  }

  return (
    <form id={formId} onSubmit={submit} className="flex flex-col gap-4">
      <fieldset>
        <legend className="sr-only">What happened</legend>
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((option) => (
            <Choice
              key={option}
              name="kind"
              checked={kind === option}
              onChange={() => setKind(option)}
            >
              {INTERACTION_KINDS[option]}
              {option === 'custom' && '…'}
            </Choice>
          ))}
        </div>
      </fieldset>

      {kind === 'custom' && (
        <Input
          aria-label="What was it?"
          placeholder="Coffee, dinner, a walk…"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          required
          maxLength={100}
          autoFocus
        />
      )}

      <fieldset>
        <legend className={labelClass}>When</legend>
        <div className="flex gap-1.5">
          {[
            [today, 'Today'],
            [yesterday, 'Yesterday'],
          ].map(([value, name]) => (
            <Choice
              key={value}
              name="day"
              checked={day === value}
              onChange={() => setDay(value)}
              look="box"
              className="flex-1 md:flex-none"
            >
              {name}
            </Choice>
          ))}
          <Input
            type="date"
            aria-label="Another day"
            value={day}
            max={today}
            required
            onChange={(event) => setDay(event.target.value)}
            className={cn('w-auto flex-none', day !== today && day !== yesterday && pickedBoxClass)}
          />
        </div>
      </fieldset>

      <div>
        <label htmlFor={`${formId}-note`} className={labelClass}>
          Note <span className="font-mono tracking-normal normal-case">optional</span>
        </label>
        <textarea
          id={`${formId}-note`}
          ref={noteBox}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={4}
          maxLength={5000}
          placeholder={`Coffee with ${firstName}. What did you talk about?`}
          className="w-full rounded-card border border-line-input bg-card px-3 py-2.5 type-body outline-none placeholder:text-ink-faint focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-focus-glow"
        />
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={keepLine}
            disabled={!note.trim()}
            title="Puts the sentence you're in, or what you selected, on a sticky note"
            className="flex h-10 cursor-pointer items-center gap-1.5 rounded-full bg-note-yellow px-3 text-sm font-medium text-note-ink disabled:cursor-not-allowed disabled:opacity-50 md:h-8"
          >
            <Plus aria-hidden className="size-3.5" />
            Turn a line into a memory aid
          </button>
          {memoryAids.length > 0 && (
            <ul aria-label="Sticky notes to add" className="contents">
              {memoryAids.map((aid) => (
                <li
                  key={aid}
                  className="flex items-center gap-1 rounded-tab bg-note-yellow py-1 pr-1 pl-2.5 type-hand text-note-ink shadow-note"
                >
                  {aid}
                  <button
                    type="button"
                    aria-label={`Don't add “${aid}”`}
                    onClick={() => setMemoryAids(memoryAids.filter((other) => other !== aid))}
                    className="flex size-7 cursor-pointer items-center justify-center rounded-full hover:bg-hover"
                  >
                    <X aria-hidden className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {error && <p className="type-small text-danger">{error}</p>}

      {onDelete && (
        <Button type="button" variant="danger" className="self-start" onClick={onDelete}>
          <Trash2 aria-hidden />
          Delete this entry
        </Button>
      )}

      <FormDialogFooter
        small
        submitLabel={interaction ? 'Save' : 'Save to timeline'}
        busy={saving}
        onCancel={onCancel}
        hint={
          <>
            <Kbd shortcut={{ key: 'Enter', mod: true }} /> saves · Esc cancels
          </>
        }
      />
    </form>
  )
}
