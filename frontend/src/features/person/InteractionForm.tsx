import { Plus, Trash2, X } from 'lucide-react'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
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
const PICKED_DAY = 'border-accent text-ink ring-3 ring-focus-glow'

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
              look="chip"
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
              look="day"
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
            className={cn('w-auto flex-none', day !== today && day !== yesterday && PICKED_DAY)}
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

/**
 * One option in a row of choices. A kind is a chip that fills in when picked; a day is
 * a box that gets outlined, like the date field next to it.
 */
function Choice({
  name,
  checked,
  onChange,
  look,
  children,
}: {
  name: string
  checked: boolean
  onChange: () => void
  look: 'chip' | 'day'
  children: ReactNode
}) {
  return (
    <label className={cn('cursor-pointer', look === 'day' && 'flex-1 md:flex-none')}>
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        className={cn(
          'flex h-11 items-center justify-center border border-line-input text-md font-medium text-ink-soft peer-focus-visible:ring-3 peer-focus-visible:ring-focus-glow hover:border-line-strong md:h-9',
          look === 'chip'
            ? 'rounded-full px-3.5 peer-checked:border-accent peer-checked:bg-accent peer-checked:text-on-accent'
            : 'rounded-card bg-card px-3',
          look === 'day' && checked && PICKED_DAY,
        )}
      >
        {children}
        {look === 'chip' && checked && (
          <span aria-hidden className="ml-1">
            ✓
          </span>
        )}
      </span>
    </label>
  )
}
