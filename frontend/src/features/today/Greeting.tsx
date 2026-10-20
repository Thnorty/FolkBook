import type { ReactNode } from 'react'
import { Doodle } from '@/components/notebook/Doodle'
import { usePartOfDay, type PartOfDay } from '@/lib/partOfDay'

// Small ink doodles, drawn on a 16×16 grid.
const GREETINGS: Record<PartOfDay, { words: string; doodle: ReactNode }> = {
  morning: {
    words: 'Good morning',
    doodle: (
      <>
        <circle cx="8" cy="8" r="2.8" />
        <path d="M8 1.6v2M8 12.4v2M1.6 8h2M12.4 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4" />
      </>
    ),
  },
  afternoon: {
    words: 'Good afternoon',
    doodle: (
      <>
        <path d="M3 6.5h8V10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3Z" />
        <path d="M11 7.4h.9a1.8 1.8 0 0 1 0 3.6H10.7" />
        <path d="M6 2.4c-.7.8.7 1.5 0 2.4M8.6 2.4c-.7.8.7 1.5 0 2.4" />
      </>
    ),
  },
  evening: {
    words: 'Good evening',
    doodle: (
      <>
        <path d="M1.8 11.4h12.4M4.6 14h6.8" />
        <path d="M4.5 11.4a3.5 3.5 0 0 1 7 0" />
        <path d="M8 4.4V6M3.3 6.6l1 1M12.7 6.6l-1 1" />
      </>
    ),
  },
  night: {
    words: 'Still up?',
    doodle: (
      <>
        <path d="M12.6 10.3A5.2 5.2 0 0 1 5.7 3.4a5.2 5.2 0 1 0 6.9 6.9Z" />
        <path d="M12.2 2v2.4M11 3.2h2.4" />
      </>
    ),
  },
}

/** "Good morning" with a doodle of the time of day, for Today's header. */
export function Greeting() {
  const { words, doodle } = GREETINGS[usePartOfDay()]
  return (
    <span>
      <Doodle viewBox="0 0 16 16" className="mr-1.5 inline size-4 align-text-bottom text-ink-soft">
        {doodle}
      </Doodle>
      {words}
    </span>
  )
}
