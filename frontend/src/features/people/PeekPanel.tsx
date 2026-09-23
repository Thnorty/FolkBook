import { Link } from '@tanstack/react-router'
import { Maximize2, X } from 'lucide-react'
import { useEffect } from 'react'
import { ProfileView } from '@/features/person/ProfileView'
import type { FlyOrigin } from '@/motion/FlyFrom'

type PeekPanelProps = {
  personId: string
  /** Where the clicked card's photo and name were, so they glide in from there. */
  flyFrom?: FlyOrigin | null
  onClose: () => void
}

/** A person's profile beside the People list, on desktop (screen 1c). */
export function PeekPanel({ personId, flyFrom, onClose }: PeekPanelProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <aside
      aria-label="Peek"
      className="sticky top-4 hidden max-h-[calc(100dvh-2rem)] overflow-y-auto [scrollbar-gutter:stable] rounded-card border border-line bg-paper shadow-float md:block"
    >
      <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-line bg-paper px-3 py-2">
        <span className="px-2 type-meta text-ink-faint">Peek</span>
        <Link
          to="/people/$personId"
          params={{ personId }}
          className="ml-auto flex items-center gap-1.5 rounded-card px-2.5 py-2 text-md font-medium text-accent hover:bg-hover"
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
        <ProfileView personId={personId} compact flyFrom={flyFrom} />
      </div>
    </aside>
  )
}
