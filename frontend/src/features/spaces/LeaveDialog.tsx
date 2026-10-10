import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Polaroid } from '@/components/notebook/Polaroid'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { firstNames, writtenSummary } from '@/features/kept/labels'
import { useReviewKept } from '@/features/kept/useReviewKept'
import { notify } from '@/lib/notify'
import { peopleCount } from './labels'
import { leavePreviewQuery, leaveSpace, refreshSpaces, type Space } from './queries'
import { firstNameOf } from '@/lib/names'

/** "Leave Climbing club?": who you'd keep a copy of, and who'd go (screens 5a, 5b). */
export function LeaveDialog({ space, onClose }: { space: Space; onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const review = useReviewKept()
  const preview = useQuery(leavePreviewQuery(space.id))
  const owner = space.owner ? firstNameOf(space.owner.name) : 'The owner'

  const leave = useMutation({
    mutationFn: () => leaveSpace(space.id),
    onSuccess: async ({ kept }) => {
      onClose()
      await navigate({ to: '/spaces' })
      await refreshSpaces(queryClient)
      notify({
        title: `You left ${space.name}`,
        description: kept.length > 0 ? `You kept ${firstNames(kept)}.` : undefined,
        action: kept.length > 0 ? { label: 'Review', onClick: () => review(kept) } : undefined,
      })
    },
    onError: (error) => notify({ title: "Couldn't leave", description: error.message }),
  })

  const data = preview.data
  const kept = data?.kept ?? []
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Leave ${space.name}?`}
      description={
        !data
          ? 'Checking who you wrote notes on…'
          : kept.length > 0
            ? `You keep copies of the ${peopleCount(kept.length)} you wrote notes on:`
            : "You didn't write notes on anyone here, so there's nothing to keep."
      }
      confirmLabel={`Leave ${space.name}`}
      busy={!data || leave.isPending}
      onConfirm={() => leave.mutate()}
    >
      {kept.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2 rounded-card border border-line bg-card px-4 py-3">
          {kept.map(({ person, ...written }) => (
            <li key={person.id} className="flex items-center gap-3">
              <Polaroid seed={person.id} />
              <span className="min-w-0 flex-1">
                <span className="block font-serif text-lg">{person.name}</span>
                <span className="block type-meta text-ink-faint">{writtenSummary(written)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {data && (
        <p className="mt-3 type-small text-ink-soft">
          {data.leaving > 0 && `The other ${peopleCount(data.leaving)} leave your book. `}
          {kept.length > 0 && 'Copies are marked kept and become yours to edit. '}
          {data.own_people > 0
            ? `The ${peopleCount(data.own_people)} you added from your own book leave the space with you.`
            : `${owner} and the other members lose nothing.`}
        </p>
      )}
      <p className="mt-2 type-meta text-ink-faint">You can ask {owner} to add you again</p>
    </ConfirmDialog>
  )
}
