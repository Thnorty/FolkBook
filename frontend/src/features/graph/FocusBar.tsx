import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { SHORTCUTS } from '@/app/nav'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Toggle } from './Toggle'

type FocusBarProps = {
  /** The focused person's full name, once known. */
  name?: string
  hops: 1 | 2
  onHops: (hops: 1 | 2) => void
  onBack: () => void
  /** Under the bar: the count line, or why there is none. */
  note: ReactNode
}

/** Focus mode's bar (screens 3h, 3i): back to everyone, who's focused, 1 or 2 steps. */
export function FocusBar({ name, hops, onHops, onBack, note }: FocusBarProps) {
  return (
    <div className="mt-3">
      <div role="group" aria-label="Focus" className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden />
          Back to everyone
        </Button>
        <Kbd shortcut={SHORTCUTS.back} className="hidden text-ink-faint md:inline" />
        {name && <span className="font-medium">Focused on {name}</span>}
        <div role="group" aria-label="Steps" className="flex gap-1.5 md:ml-auto">
          <Toggle pressed={hops === 1} onClick={() => onHops(1)}>
            1 step
          </Toggle>
          <Toggle pressed={hops === 2} onClick={() => onHops(2)}>
            2 steps
          </Toggle>
        </div>
      </div>
      {note && <p className="mt-2 type-small text-ink-soft">{note}</p>}
    </div>
  )
}
