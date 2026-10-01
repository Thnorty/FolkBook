import { useQuery } from '@tanstack/react-query'
import { useRef } from 'react'
import { ApiError } from '@/api/errors'
import { cn } from '@/lib/utils'
import type { FlyOrigin } from '@/motion/FlyFrom'
import { usePageTitle } from '@/lib/usePageTitle'
import { PageFade } from '@/motion/PageTurn'
import { ConnectionsSection } from './ConnectionsSection'
import { KeepInTouch } from './KeepInTouch'
import { NotesSection } from './NotesSection'
import { ProfileHeader } from './ProfileHeader'
import { PersonMenu } from './PersonMenu'
import { personQuery } from './queries'
import { RememberSection } from './RememberSection'
import { TimelineSection } from './TimelineSection'

type ProfileViewProps = {
  personId: string
  /** One narrow column, for the peek panel beside the People list. */
  compact?: boolean
  /** In the peek panel: where the clicked card's photo and name were. */
  flyFrom?: FlyOrigin | null
  /** Leave once the person is torn out of the book. */
  onGone: () => void
}

/** Everything about one person: the profile page and the desktop peek panel. */
export function ProfileView({ personId, compact = false, flyFrom, onGone }: ProfileViewProps) {
  const person = useQuery(personQuery(personId))
  const page = useRef<HTMLDivElement>(null)
  usePageTitle(person.data?.name ?? 'Person')

  if (person.isPending) {
    return <p className="py-10 text-center text-ink-soft">Opening their page…</p>
  }
  if (person.isError) {
    const missing = person.error instanceof ApiError && person.error.status === 404
    return (
      <div className="py-10 text-center">
        <h1 className="type-title">{missing ? 'Not in your notebook' : 'Something went wrong'}</h1>
        <p className="mt-2 text-ink-soft">
          {missing
            ? "This person isn't in your notebook, or isn't shared with you anymore."
            : person.error.message}
        </p>
      </div>
    )
  }

  const data = person.data
  const firstName = data.name.split(' ')[0]

  return (
    <div
      ref={page}
      className={cn(
        'flex flex-col gap-8',
        !compact && 'lg:grid lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start lg:gap-12',
      )}
    >
      <div className={cn('flex flex-col gap-8', !compact && 'lg:sticky lg:top-6')}>
        <ProfileHeader
          person={data}
          pageTurn={!compact}
          flyFrom={flyFrom}
          menu={data.can_delete && <PersonMenu person={data} page={page} onGone={onGone} />}
        />
        {!data.is_me && (
          <PageFade afterTurn={!compact}>
            <KeepInTouch personId={personId} />
          </PageFade>
        )}
      </div>
      <PageFade afterTurn={!compact} className="flex flex-col gap-9">
        <RememberSection personId={personId} />
        <NotesSection personId={personId} firstName={firstName} />
        <ConnectionsSection personId={personId} />
        <TimelineSection personId={personId} canLog={!data.is_me} />
      </PageFade>
    </div>
  )
}
