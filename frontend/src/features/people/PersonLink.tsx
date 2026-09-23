import { Link } from '@tanstack/react-router'
import { PersonCard } from '@/components/notebook/PersonCard'
import { Polaroid } from '@/components/notebook/Polaroid'
import { formatDaysAgo } from '@/lib/dates'
import { isWideScreen } from '@/lib/media'
import { cn } from '@/lib/utils'
import type { FlyOrigin } from '@/motion/FlyFrom'
import { Shared } from '@/motion/PageTurn'
import { sharedPerson } from '@/motion/sharedIds'
import type { Person } from './queries'

const LINK = 'block rounded-card focus-visible:outline-offset-2'

/** The line under a name: how you met, or a nudge when nobody wrote it down. */
function detail(person: Person) {
  if (person.is_me) return 'You'
  if (person.how_we_met) return person.how_we_met
  if (person.needs_details) return 'How do you know them?'
  return person.work
}

/** When you last talked, or a marker for people who still need details. */
function Meta({ person }: { person: Person }) {
  if (person.last_talked_on) return <>{formatDaysAgo(person.last_talked_on)}</>
  if (person.needs_details) return <span className="text-accent">Needs details</span>
  return <span aria-label="Never talked">—</span>
}

/** A person in the People list: their card, opening their profile. */
type PersonRowProps = {
  person: Person
  /** Desktop: a plain click opens the person beside the list, from where their card is. */
  onPeek?: (personId: string, from: FlyOrigin) => void
}

export function PersonRow({ person, onPeek }: PersonRowProps) {
  return (
    <Link
      to="/people/$personId"
      params={{ personId: person.id }}
      className={LINK}
      onClick={(event) => {
        // On desktop a plain click peeks in the side panel; Ctrl/⌘-click still opens the page.
        const plain = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey
        if (onPeek && plain && isWideScreen()) {
          event.preventDefault()
          const where = (id: string) =>
            event.currentTarget.querySelector(`[data-shared="${id}"]`)?.getBoundingClientRect()
          onPeek(person.id, {
            photo: where(sharedPerson.photo(person.id)),
            name: where(sharedPerson.name(person.id)),
          })
        }
      }}
    >
      <PersonCard
        id={person.id}
        name={person.name}
        detail={detail(person)}
        spaces={person.spaces}
        meta={person.is_me ? undefined : <Meta person={person} />}
        className={cn(
          'transition-shadow hover:shadow-float',
          person.needs_details && 'border-dashed',
        )}
      />
    </Link>
  )
}

/** A person in the grid view: a big polaroid with the name under it. */
export function PersonTile({ person }: { person: Person }) {
  return (
    <Link
      to="/people/$personId"
      params={{ personId: person.id }}
      className={cn(LINK, 'flex flex-col items-center gap-3 p-3 text-center hover:bg-hover')}
    >
      <Shared id={sharedPerson.photo(person.id)}>
        <Polaroid seed={person.id} size="lg" />
      </Shared>
      <span className="min-w-0">
        <Shared id={sharedPerson.name(person.id)}>
          <span className="block truncate type-heading">{person.name}</span>
        </Shared>
        <span className="mt-0.5 block truncate text-sm text-ink-soft">{detail(person)}</span>
      </span>
    </Link>
  )
}
