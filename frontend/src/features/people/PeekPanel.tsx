import { Link } from '@tanstack/react-router'
import { Maximize2, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { ProfileView } from '@/features/person/ProfileView'
import { useShortcut } from '@/lib/shortcuts'
import type { FlyOrigin } from '@/motion/FlyFrom'

const CLOSE = { key: 'Escape' }

type PeekPanelProps = {
  personId: string
  /** Where the clicked card's photo and name were, so they glide in from there. */
  flyFrom?: FlyOrigin | null
  onClose: () => void
  /** More buttons in the top bar, before "Expand to page". */
  actions?: ReactNode
}

/** A person's profile beside the People list, on desktop (screen 1c). */
export function PeekPanel({ personId, flyFrom, onClose, actions }: PeekPanelProps) {
  // Not when a dialog or menu on top closes first, or while typing in the panel.
  useShortcut(CLOSE, onClose)

  return (
    <aside
      aria-label="Peek"
      className="sticky top-6 hidden max-h-[calc(100dvh-3rem)] overflow-y-auto [scrollbar-gutter:stable] rounded-card border border-line bg-paper shadow-float md:block"
    >
      <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-line bg-paper px-3 py-2">
        {/* With more actions (on the graph) the bar needs the room. */}
        {!actions && <span className="px-2 type-meta text-ink-faint">Peek</span>}
        <span className="ml-auto" />
        {actions}
        <Link
          to="/people/$personId"
          params={{ personId }}
          className="flex items-center gap-1.5 rounded-card px-2.5 py-2 text-md font-medium whitespace-nowrap text-accent hover:bg-hover"
        >
          <Maximize2 aria-hidden className="size-3.5" />
          Expand to page
        </Link>
        <button
          type="button"
          aria-label="Close peek"
          onClick={onClose}
          className="flex size-9 cursor-pointer items-center justify-center rounded-card text-ink-soft hover:bg-hover hover:text-ink"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <div className="p-5">
        {/* A fresh view per person, so one person's header never flies in as another's. */}
        <ProfileView
          key={personId}
          personId={personId}
          compact
          flyFrom={flyFrom}
          onGone={onClose}
        />
      </div>
    </aside>
  )
}
