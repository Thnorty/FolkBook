import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { words } from '@/lib/names'
import type { ImportResult } from './queries'

type DoneStepProps = {
  result: ImportResult
  mergedInto: string[]
}

/** Step 5 (screen 4t): what came in, and what's next. */
export function DoneStep({ result, mergedInto }: DoneStepProps) {
  const added = `Imported ${result.added} new ${result.added === 1 ? 'person' : 'people'}`
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-1.5 rounded-card border border-line bg-card px-4 py-3">
        <li className="type-heading">
          {result.space ? `${added}, in ${result.space.name}` : added}
        </li>
        {result.merged > 0 && (
          <li className="type-small text-ink-soft">
            {result.merged} merged into {words(mergedInto)}
          </li>
        )}
        {result.left_out > 0 && (
          <li className="type-small text-ink-soft">
            {result.left_out} left out — they stay in your phone
          </li>
        )}
      </ul>
      {result.added > 0 && (
        <p className="type-small text-ink-soft">
          They don't know how you know them yet. A few quick questions, one per person, or find them
          later under Needs details.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button asChild variant="ghost">
          <Link to="/people">Later</Link>
        </Button>
        {result.added > 0 && (
          <Button asChild>
            <Link to="/people/fill-in" search={{ import: result.import_id }}>
              Fill in the blanks →
            </Link>
          </Button>
        )}
      </div>
    </div>
  )
}
