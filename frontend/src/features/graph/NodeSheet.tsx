import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { memoryAidsQuery, personQuery } from '@/features/person/queries'
import { useInteractionForm } from '@/features/person/useInteractionForm'

/** The node preview on phones: a sheet from the bottom (screen 3d). */
export function NodeSheet({
  personId,
  onClose,
  primary,
  onHow,
}: {
  personId: string
  onClose: () => void
  /** The first button after Open profile: Focus in the network, Show their tree in a tree. */
  primary: { label: string; onClick: () => void }
  /** "How do I know them?" */
  onHow: () => void
}) {
  const person = useQuery(personQuery(personId)).data
  const aids = useQuery(memoryAidsQuery(personId)).data ?? []
  const { openLog } = useInteractionForm()
  if (!person) return null

  return (
    <section
      aria-label={`${person.name}, preview`}
      className="fixed inset-x-0 bottom-0 z-20 rounded-t-sheet border-t border-line bg-paper p-5 pb-24 shadow-float md:hidden"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="type-title">{person.name}</h2>
          {person.how_we_met && <p className="type-small text-ink-soft">{person.how_we_met}</p>}
        </div>
        <Button variant="ghost" aria-label="Close preview" className="w-9 px-0" onClick={onClose}>
          <X aria-hidden />
        </Button>
      </div>
      {aids[0] && <p className="mt-3 type-hand">{aids[0].text}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/people/$personId" params={{ personId }}>
            Open profile
          </Link>
        </Button>
        <Button variant="secondary" onClick={primary.onClick}>
          {primary.label}
        </Button>
        {!person.is_me && (
          <>
            <Button variant="secondary" onClick={onHow}>
              How do I know them?
            </Button>
            <Button variant="ghost" onClick={() => openLog(personId)}>
              Log
            </Button>
          </>
        )}
      </div>
    </section>
  )
}
