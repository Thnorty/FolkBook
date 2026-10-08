import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { peopleCount } from '@/features/spaces/labels'
import { words } from '@/lib/names'
import { notify, UNDO_FOR } from '@/lib/notify'
import { redoImport, undoImport, undoPreviewQuery, type RecentImport } from './queries'

const NAMES_SHOWN = 5

/** "Undo the import of contacts.vcf?": who goes, who stays, who loses details. */
export function UndoImportDialog({
  batch,
  open,
  onClose,
}: {
  batch: RecentImport
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const preview = useQuery(undoPreviewQuery(batch.id))
  const undo = useMutation({
    mutationFn: () => undoImport(queryClient, batch.id),
    onSuccess: () => {
      onClose()
      notify({
        title: 'Import undone',
        duration: UNDO_FOR,
        action: {
          label: 'Undo',
          onClick: () =>
            void redoImport(queryClient, batch.id).then(
              () => notify({ title: `The import of ${batch.file_name} is back` }),
              (error: Error) => notify({ title: "Couldn't undo that", description: error.message }),
            ),
        },
      })
    },
  })
  // Only a fresh answer: numbers from an earlier opening may be out of date by now.
  const ready = preview.data && !preview.isFetching ? preview.data : undefined
  const { goes = [], stays = [], loses_details: loses = [] } = ready ?? {}

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={`Undo the import of ${batch.file_name}?`}
      description="The people it added are deleted, and what it added to people you had is taken back. Anything you've changed since stays."
      cancelLabel="Keep"
      confirmLabel="Undo import"
      busy={!ready || undo.isPending}
      onConfirm={() => undo.mutate()}
    >
      {preview.error && (
        <p role="alert" className="mt-3 type-small text-danger">
          {preview.error.message}
        </p>
      )}
      {preview.isFetching && (
        <p role="status" className="mt-3 type-small text-ink-soft">
          Working out who goes…
        </p>
      )}
      {ready && (
        <ul className="mt-3 flex flex-col gap-2 type-small">
          <Line people={goes}>{goesLine(goes.length)}</Line>
          {stays.length > 0 && (
            <Line people={stays}>
              {stays.length} you've written about since {stays.length === 1 ? 'stays' : 'stay'}
            </Line>
          )}
          {loses.length > 0 && (
            <Line people={loses}>
              {loses.length === 1
                ? '1 person you had loses'
                : `${peopleCount(loses.length)} you had lose`}{' '}
              the details this import added
            </Line>
          )}
        </ul>
      )}
      {undo.error && (
        <p role="alert" className="mt-3 type-small text-danger">
          {undo.error.message}
        </p>
      )}
    </ConfirmDialog>
  )
}

function goesLine(count: number): string {
  if (count === 0) return 'Nobody goes'
  return count === 1 ? '1 person goes' : `${peopleCount(count)} go`
}

/** One line of what happens, with who: "Chen Wei, Greta Holm and 3 more". */
function Line({ people, children }: { people: { name: string }[]; children: ReactNode }) {
  const shown = people.length > NAMES_SHOWN ? NAMES_SHOWN - 1 : NAMES_SHOWN
  const rest = people.length - shown
  return (
    <li>
      <span className="font-medium text-ink">{children}</span>
      {people.length > 0 && (
        <span className="text-ink-soft">
          : {words([...people.slice(0, shown).map((p) => p.name), rest > 0 && `${rest} more`])}
        </span>
      )}
    </li>
  )
}
