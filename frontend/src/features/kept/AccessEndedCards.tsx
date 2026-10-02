import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { ProfileSection as Section } from '@/features/person/ProfileSection'
import { peopleCount } from '@/features/spaces/labels'
import { notify } from '@/lib/notify'
import { KeptBadge } from './KeptFrom'
import { lostTheSpace, whatEnded, type AccessEnded } from './labels'
import { dismissAccessEnded } from './queries'
import { useReviewKept } from './useReviewKept'

/** "Sharing ended": who left your book because of someone else, and who you kept (4n). */
export function AccessEndedCards({ notices }: { notices: AccessEnded[] }) {
  const queryClient = useQueryClient()
  const review = useReviewKept()
  const dismiss = (notice: AccessEnded) =>
    dismissAccessEnded(queryClient, notice.id).catch((error: Error) =>
      notify({ title: "Couldn't dismiss that", description: error.message }),
    )

  return (
    <Section title={notices.some(lostTheSpace) ? 'Sharing ended' : 'Kept copies'}>
      <ul className="flex flex-col gap-3">
        {notices.map((notice) => {
          const kept = notice.kept
          const others = notice.lost - kept.length
          return (
            <li key={notice.id} className="rounded-card border border-line bg-card p-4">
              <p className="font-serif text-lg">{notice.space || notice.about}</p>
              <p className="type-small text-ink-soft">
                {whatEnded(notice)}.{' '}
                {kept.length > 0
                  ? `You kept ${peopleCount(kept.length)} you had notes on.`
                  : 'You had no notes on anyone there, so nobody was kept.'}
              </p>
              {kept.length > 0 && (
                <ul aria-label="Kept" className="mt-2 flex flex-col">
                  {kept.map((person) => (
                    <li key={person.id} className="flex items-center gap-2 py-1">
                      <Link
                        to="/people/$personId"
                        params={{ personId: person.id }}
                        className="font-serif text-lg hover:underline"
                      >
                        {person.name}
                      </Link>
                      <KeptBadge />
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 type-small text-ink-faint">
                {lostTheSpace(notice) && others > 0 && `The other ${others} left with the space. `}
                {kept.length > 0 && 'Kept people are now yours to edit.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {kept.length > 0 && (
                  <Button variant="secondary" onClick={() => review(kept)}>
                    Review kept people
                  </Button>
                )}
                <Button variant="ghost" onClick={() => void dismiss(notice)}>
                  Dismiss
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}
