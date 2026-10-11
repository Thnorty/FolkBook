import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { warnAt } from '@/lib/fieldWarnings'
import {
  AidCard,
  ChangeCard,
  ConnectionCard,
  EntryCard,
  PersonCard,
  type CardProps,
} from './ReviewCards'
import { counts, unresolved, type AddKind, type Item, type Resolved, type Review } from './review'

const ADD: Record<AddKind, string> = {
  person: 'Person',
  connection: 'Connection',
  aid: 'Memory aid',
  entry: 'Timeline entry',
}

type ReviewStepProps = {
  text: string
  review: Review
  spaceName: string | null
  busy: boolean
  error: string | null
  onToggle: (id: string) => void
  onEdit: (id: string, changes: Partial<Item>) => void
  onResolve: (ref: string, choice: Resolved) => void
  onAdd: (kind: AddKind) => void
  onEditText: () => void
  onSave: () => void
}

/** Screens 2g, 2h: every suggestion as a card to edit or untick, then Save. */
export function ReviewStep({
  text,
  review,
  spaceName,
  busy,
  error,
  onToggle,
  onEdit,
  onResolve,
  onAdd,
  onEditText,
  onSave,
}: ReviewStepProps) {
  const [adding, setAdding] = useState(false)
  const { selected, total } = counts(review)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const [waiting] = unresolved(review)
    const who = waiting && document.getElementById(`who-${waiting}`)
    if (who) return warnAt(who, 'Choose who this is first.')
    onSave()
  }

  const props = { review, spaceName, onToggle, onEdit, onResolve }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={onEditText}
          className="cursor-pointer self-start type-small text-ink-soft hover:text-ink"
        >
          ← Edit text
        </button>
        <h2 className="type-title">Here's what I read</h2>
        <p className="type-small text-ink-soft">
          Edit anything, untick what's wrong. <span className="font-mono">“{text}”</span>
        </p>
      </div>

      {review.map((item) => (
        <ItemCard key={item.id} item={item} {...props} />
      ))}

      {adding ? (
        <div
          role="group"
          aria-label="Add"
          className="flex flex-wrap gap-2 rounded-card border border-dashed border-line-strong p-3"
        >
          {(Object.keys(ADD) as AddKind[]).map((kind) => (
            <Button
              key={kind}
              type="button"
              variant="secondary"
              onClick={() => {
                onAdd(kind)
                setAdding(false)
              }}
            >
              {ADD[kind]}
            </Button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="min-h-11 cursor-pointer rounded-card border border-dashed border-line-strong text-ink-soft hover:text-ink md:min-h-10"
        >
          + Add something the AI missed
        </button>
      )}

      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {/* Stays in view while scrolling the cards; above the bottom tabs on phones. */}
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] flex items-center gap-2 border-t border-line bg-paper py-3 md:bottom-0">
        <span className="type-small text-ink-soft">
          {selected} of {total} selected
        </span>
        <Button type="button" variant="ghost" className="ml-auto" onClick={onEditText}>
          Discard
        </Button>
        <Button type="submit" disabled={busy || selected === 0}>
          {busy ? 'Saving…' : `Save ${selected} ${selected === 1 ? 'item' : 'items'}`}
        </Button>
      </div>
    </form>
  )
}

function ItemCard({ item, ...props }: Omit<CardProps<Item>, 'item'> & { item: Item }) {
  switch (item.kind) {
    case 'person':
      return <PersonCard item={item} {...props} />
    case 'change':
      return <ChangeCard item={item} {...props} />
    case 'connection':
      return <ConnectionCard item={item} {...props} />
    case 'aid':
      return <AidCard item={item} {...props} />
    case 'entry':
      return <EntryCard item={item} {...props} />
  }
}
