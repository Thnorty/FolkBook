import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Polaroid } from './Polaroid'
import { SpaceChip, type SpaceColor } from './spaces'

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
      <Polaroid seed={id} photoUrl={photoUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate type-heading">{name}</p>
        {detail && <p className="mt-0.5 truncate text-sm text-ink-soft">{detail}</p>}
      </div>
      {spaces.length > 0 && (
        <ul aria-label="Spaces" className="hidden flex-none gap-1.5 sm:flex">
          {spaces.map((space) => (
            <li key={space.id}>
              <SpaceChip {...space} />
            </li>
          ))}
        </ul>
      )}
      {meta && <div className="flex-none text-right type-meta text-ink-faint">{meta}</div>}
    </article>
  )
}
