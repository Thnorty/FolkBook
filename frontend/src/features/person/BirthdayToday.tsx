import { useEffect, useState } from 'react'
import { Doodle } from '@/components/notebook/Doodle'
import { Button } from '@/components/ui/button'
import { useWish } from '@/features/today/useWish'
import { PaperConfetti } from '@/motion/PaperConfetti'
import { birthdayDetail } from './labels'
import type { PersonDetail } from './queries'

const PAPER_SEEN = 'folkbook.birthdayPaper'

type BirthdayTodayProps = {
  person: PersonDetail
  today: string
  turns: number | null | undefined
}

/** Bunting, "Turns 34 today" and a Wish button, under their name on the day. */
export function BirthdayToday({ person, today, turns }: BirthdayTodayProps) {
  const wish = useWish()
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Doodle viewBox="0 0 40 16" className="h-4 w-10 text-accent">
        <path d="M2 2.5Q20 9 38 2.5" />
        <path d="M4.5 4.4 7 10l2.5-5.2M12.5 5.7 15 11.4l2.5-5.5M20.5 6.2 23 12l2.5-6M28.5 5.4 31 11l2.5-5.6" />
      </Doodle>
      <p className="type-hand text-ink">{birthdayDetail(turns, 'today')}</p>
      <Button variant="secondary" onClick={() => wish(person, today)}>
        Wish
      </Button>
    </div>
  )
}

/** Paper falls around their photo the first time their page opens on the day, on this device. */
export function BirthdayPaper({ personId, today }: { personId: string; today: string }) {
  const [falls] = useState(() => seenOn(personId) !== today)
  useEffect(() => markSeen(personId, today), [personId, today])
  return falls && <PaperConfetti seed={personId} />
}

function seen(): Record<string, string> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(PAPER_SEEN) ?? '{}')
    return stored && typeof stored === 'object' ? (stored as Record<string, string>) : {}
  } catch {
    return {} // storage blocked or garbled: let it fall again
  }
}

function seenOn(personId: string): string | undefined {
  return seen()[personId]
}

function markSeen(personId: string, today: string) {
  try {
    localStorage.setItem(PAPER_SEEN, JSON.stringify({ ...seen(), [personId]: today }))
  } catch {
    // Can't remember it here; it may fall again next time.
  }
}
