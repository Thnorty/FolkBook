import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { firstNameOf } from '@/lib/names'
import type { Saved } from './queries'
import { summary } from './review'

type SavedStepProps = {
  saved: Saved
  undoing: boolean
  error: string | null
  onAnother: () => void
  onUndo: () => void
}

/** Screen 2i: what was saved, and Undo while it's fresh. */
export function SavedStep({ saved, undoing, error, onAnother, onUndo }: SavedStepProps) {
  const open = saved.people.find((person) => person.new) ?? saved.people[0]
  return (
    <div className="flex flex-col gap-4">
      <h2 className="self-start border-b-2 border-accent pb-1 type-display">Saved</h2>
      <div className="flex flex-col gap-1 text-ink-soft">
        {summary(saved).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      {saved.people.length > 0 && (
        <ul className="flex flex-col gap-2">
          {saved.people.map((person) => (
            <li
              key={person.id}
              className="flex items-center gap-3 rounded-card border border-line bg-card px-4 py-3 shadow-photo"
            >
              <Link
                to="/people/$personId"
                params={{ personId: person.id }}
                className="font-serif text-lg hover:underline"
              >
                {person.name}
              </Link>
              {person.new && <span className="ml-auto type-meta text-ink-faint">New</span>}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2 md:flex-row">
        {open && (
          <Button asChild className="h-12 md:h-9">
            <Link to="/people/$personId" params={{ personId: open.id }}>
              Open {firstNameOf(open.name)}'s page
            </Link>
          </Button>
        )}
        <Button type="button" variant="secondary" className="h-12 md:h-9" onClick={onAnother}>
          Capture something else
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="md:ml-auto"
          disabled={undoing}
          onClick={onUndo}
        >
          {undoing ? 'Undoing…' : 'Undo all of this'}
        </Button>
      </div>
    </div>
  )
}
