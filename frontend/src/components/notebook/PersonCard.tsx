import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Shared } from '@/motion/PageTurn'
import { sharedPerson } from '@/motion/sharedIds'
import { Polaroid } from './Polaroid'
import { SpaceChip, SpaceRibbon, type SpaceColor } from './spaces'

type PersonCardProps = {
  id: string
  name: string
  /** One line under the name, e.g. how you met. */
  detail?: string
  photoUrl?: string | null
  spaces?: { id: string; name: string; color: SpaceColor; shared?: boolean }[]
  /** Right-hand meta, e.g. "10 days ago". */
  meta?: ReactNode
  className?: string
}

export function PersonCard({
  id,
  name,
  detail,
  photoUrl,
  spaces = [],
  meta,
  className,
}: PersonCardProps) {
  return (
    <article
      aria-label={name}
      className={cn(
        'flex items-center gap-3 rounded-card border border-line bg-card px-3.5 py-3 shadow-paper',
        className,
      )}
    >
      {/* Photo and name travel into the profile when the card opens ("page turn"). */}
      <Shared id={sharedPerson.photo(id)}>
        <Polaroid seed={id} photoUrl={photoUrl} />
      </Shared>
      <div className="min-w-0 flex-1">
        <Shared id={sharedPerson.name(id)}>
          <p className="truncate type-heading">{name}</p>
        </Shared>
        {detail && <p className="mt-0.5 truncate text-sm text-ink-soft">{detail}</p>}
      </div>
      {/* Phones: ribbons stacked over the meta (screen 4c). Wider: chips beside it (1a). */}
      <div className="flex flex-none flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        {spaces.length > 0 && (
          <ul aria-label="Spaces" className="flex gap-0.5 sm:gap-1.5">
            {spaces.map((space) => (
              <li key={space.id}>
                <span className="sm:hidden">
                  <SpaceRibbon {...space} />
                </span>
                <span className="max-sm:hidden">
                  <SpaceChip {...space} />
                </span>
              </li>
            ))}
          </ul>
        )}
        {meta && <div className="text-right type-meta text-ink-faint">{meta}</div>}
      </div>
    </article>
  )
}
