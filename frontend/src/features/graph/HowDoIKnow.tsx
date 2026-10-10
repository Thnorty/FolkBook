import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useRef } from 'react'
import { SHORTCUTS } from '@/app/nav'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { PersonSearch } from '@/features/people/PersonSearch'
import { personQuery } from '@/features/person/queries'
import { useShortcut } from '@/lib/shortcuts'

type HowDoIKnowProps = {
  /** The person whose route is shown, if any. */
  personId?: string
  /** Your own Me, never offered. */
  meId?: string
  onPick: (personId: string) => void
  onClear: () => void
}

/** The graph's "How do I know…?" box (screens 3f, 3i): pick someone to see the route. */
export function HowDoIKnow({ personId, meId, onPick, onClear }: HowDoIKnowProps) {
  const input = useRef<HTMLInputElement>(null)
  useShortcut(SHORTCUTS.howDoIKnow, () => input.current?.focus(), { enabled: !personId })
  const person = useQuery({ ...personQuery(personId ?? ''), enabled: Boolean(personId) })

  if (personId) {
    return (
      <div className="flex h-11 w-full items-center gap-2 rounded-card border border-line-input bg-card pl-3 md:h-9 md:w-80">
        <span className="type-meta text-ink-faint">How do I know</span>
        <span className="min-w-0 flex-1 truncate font-medium">{person.data?.name ?? '…'}</span>
        <Button variant="ghost" aria-label="Clear the route" className="w-9 px-0" onClick={onClear}>
          <X aria-hidden />
        </Button>
      </div>
    )
  }
  return (
    <div className="w-full md:w-80">
      <PersonSearch
        id="how-do-i-know"
        label="How do I know…?"
        hint={<Kbd shortcut={SHORTCUTS.howDoIKnow} className="hidden text-ink-faint md:inline" />}
        placeholder="Search your notebook"
        exclude={meId ? [meId] : []}
        onPick={(picked) => onPick(picked.id)}
        inputRef={input}
      />
    </div>
  )
}
