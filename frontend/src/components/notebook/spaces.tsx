import { UsersRound } from 'lucide-react'
import type { components } from '@/api/schema'
import { cn } from '@/lib/utils'

export type SpaceColor = components['schemas']['Color']

type SpaceLabelProps = {
  name: string
  color: SpaceColor
  /** Shared with other people: shows the people icon. */
  shared?: boolean
}

function SharedIcon() {
  return (
    <>
      <UsersRound aria-hidden className="size-3" />
      <span className="sr-only">(shared)</span>
    </>
  )
}

/** A space's name on a small colored pill, e.g. on a person card. */
export function SpaceChip({ name, color, shared }: SpaceLabelProps) {
  return (
    <span
      data-space={color}
      className="inline-flex items-center gap-1 rounded-full bg-space px-2.5 py-0.5 text-2xs font-medium whitespace-nowrap text-on-space"
    >
      {name}
      {shared && <SharedIcon />}
    </span>
  )
}

type SpaceTabProps = SpaceLabelProps & {
  active?: boolean
  onSelect?: () => void
}

/** A notebook divider tab. The active one is solid; the others are tinted and sit lower. */
export function SpaceTab({ name, color, shared, active = false, onSelect }: SpaceTabProps) {
  return (
    <button
      type="button"
      data-space={color}
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        'inline-flex cursor-pointer items-center gap-1.5 rounded-t-tab text-md font-medium whitespace-nowrap',
        active
          ? 'bg-space px-3.5 pt-2 pb-2.5 text-on-space'
          : 'bg-space/24 px-3 pt-1.5 pb-2 text-space-ink hover:bg-space/34',
      )}
    >
      {name}
      {shared && <SharedIcon />}
    </button>
  )
}
