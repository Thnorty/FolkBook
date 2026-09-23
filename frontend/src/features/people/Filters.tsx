import { Link } from '@tanstack/react-router'
import { UsersRound } from 'lucide-react'
import type { ReactNode } from 'react'
import type { components } from '@/api/schema'
import { ownership, peopleCount } from '@/features/spaces/labels'
import { cn } from '@/lib/utils'

type Space = components['schemas']['SpaceOut']

type ChipProps = {
  pressed: boolean
  onClick: () => void
  children: ReactNode
  /** A space's color, shown as a ribbon when it isn't picked. */
  space?: Space['color']
}

function Chip({ pressed, onClick, children, space }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      data-space={space}
      className={cn(
        'inline-flex h-9 flex-none cursor-pointer items-center gap-2 rounded-full border px-3.5 text-md font-medium whitespace-nowrap',
        pressed
          ? space
            ? 'border-transparent bg-space text-on-space'
            : 'border-transparent bg-ink text-paper'
          : 'border-line-strong bg-card text-ink-soft hover:text-ink',
      )}
    >
      {space && !pressed && <span aria-hidden className="h-3.5 w-0.75 rounded-full bg-space" />}
      {children}
    </button>
  )
}

type FilterChipsProps = {
  spaces: Space[]
  space?: string
  needsDetails: boolean
  needsDetailsCount?: number
  onChange: (filters: { space?: string; needsDetails?: boolean }) => void
}

/** All · Needs details · one chip per space. Picking one replaces the other. */
export function FilterChips({
  spaces,
  space,
  needsDetails,
  needsDetailsCount,
  onChange,
}: FilterChipsProps) {
  return (
    <div
      role="group"
      aria-label="Filter"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0"
    >
      <Chip pressed={!space && !needsDetails} onClick={() => onChange({})}>
        All
      </Chip>
      <Chip pressed={needsDetails} onClick={() => onChange({ needsDetails: !needsDetails })}>
        Needs details{needsDetailsCount ? ` · ${needsDetailsCount}` : ''}
      </Chip>
      {spaces.map((item) => (
        <Chip
          key={item.id}
          space={item.color}
          pressed={space === item.id}
          onClick={() => onChange(space === item.id ? {} : { space: item.id })}
        >
          {item.name}
        </Chip>
      ))}
      <Link
        to="/spaces"
        className="flex h-9 flex-none items-center px-2 text-md font-medium whitespace-nowrap text-accent hover:underline"
      >
        All spaces →
      </Link>
    </div>
  )
}

/** Shown above the list when a space is picked: what it is, and a way to its page. */
export function SpaceBanner({ space }: { space: Space }) {
  const facts = [peopleCount(space.people_count), ownership(space)]
  return (
    <div
      data-space={space.color}
      className="flex items-center gap-3 rounded-card border border-line bg-card px-4 py-3 shadow-ribbon"
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 font-medium">
          {space.name}
          {space.member_count > 0 && (
            <span className="flex items-center gap-1 text-sm font-normal text-ink-soft">
              <UsersRound aria-hidden className="size-3.5" />
              Shared with {space.member_count}
            </span>
          )}
        </p>
        <p className="type-meta text-ink-faint">{facts.join(' · ')}</p>
      </div>
      <Link
        to="/spaces/$spaceId"
        params={{ spaceId: space.id }}
        className="flex-none text-md font-medium text-accent hover:underline"
      >
        Space page →
      </Link>
    </div>
  )
}
