import { Link } from '@tanstack/react-router'
import { Mail, Phone, Pencil } from 'lucide-react'
import { Polaroid } from '@/components/notebook/Polaroid'
import { SpaceChip } from '@/components/notebook/spaces'
import { Button } from '@/components/ui/button'
import { formatBirthday, formatDaysAgo } from '@/lib/dates'
import { Shared } from '@/motion/PageTurn'
import { sharedPerson } from '@/motion/sharedIds'
import type { PersonDetail } from './queries'

const CONTACT_LINKS = { phone: 'tel:', email: 'mailto:' } as const

/** Photo, name, how you met and the basics (screens 1b, 1d). */
type ProfileHeaderProps = {
  person: PersonDetail
  /** Photo and name travel from the card. Not in the peek panel, where the card stays in view. */
  pageTurn?: boolean
}

export function ProfileHeader({ person, pageTurn = true }: ProfileHeaderProps) {
  const facts = [
    person.work,
    person.birthday && `Birthday ${formatBirthday(person.birthday)}`,
  ].filter(Boolean)

  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-end gap-5">
        <Shared id={pageTurn ? sharedPerson.photo(person.id) : undefined}>
          <Polaroid seed={person.id} size="lg" />
        </Shared>
        {person.can_edit && (
          <Button asChild variant="secondary" className="ml-auto">
            <Link to="/people/$personId/edit" params={{ personId: person.id }}>
              <Pencil aria-hidden />
              Edit
            </Link>
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Shared id={pageTurn ? sharedPerson.name(person.id) : undefined}>
          <h1 className="type-display">{person.name}</h1>
        </Shared>
        {person.how_we_met && <p className="text-ink-soft">{person.how_we_met}</p>}
        {!person.is_mine && person.owner && (
          <p className="type-small text-ink-soft">From {person.owner.name}&apos;s notebook</p>
        )}
        {person.last_talked_on && (
          <p className="type-meta text-ink-faint">
            Last talked {formatDaysAgo(person.last_talked_on)}
          </p>
        )}
      </div>

      {person.spaces.length > 0 && (
        <ul aria-label="Spaces" className="flex flex-wrap gap-1.5">
          {person.spaces.map((space) => (
            <li key={space.id}>
              <SpaceChip name={space.name} color={space.color} />
            </li>
          ))}
        </ul>
      )}

      {(facts.length > 0 || person.contact_methods.length > 0 || person.tags.length > 0) && (
        <ul aria-label="Details" className="flex flex-col gap-1.5 type-small">
          {facts.map((fact) => (
            <li key={fact as string}>{fact}</li>
          ))}
          {person.contact_methods.map((method) => {
            const Icon = method.kind === 'email' ? Mail : Phone
            const scheme =
              method.kind in CONTACT_LINKS
                ? CONTACT_LINKS[method.kind as keyof typeof CONTACT_LINKS]
                : undefined
            return (
              <li key={method.id} className="flex items-center gap-2">
                <Icon aria-hidden className="size-3.5 text-ink-faint" />
                {scheme ? (
                  <a href={`${scheme}${method.value}`} className="text-accent hover:underline">
                    {method.value}
                  </a>
                ) : (
                  method.value
                )}
                {method.label && <span className="text-ink-faint">{method.label}</span>}
              </li>
            )
          })}
          {person.tags.length > 0 && (
            <li className="flex flex-wrap gap-1.5">
              {person.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-hover px-2.5 py-0.5 text-sm">
                  {tag}
                </span>
              ))}
            </li>
          )}
        </ul>
      )}
    </header>
  )
}
