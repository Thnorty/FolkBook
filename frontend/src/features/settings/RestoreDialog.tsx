import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { currentUserQuery } from '@/api/session'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { countOf } from '@/features/person/labels'
import { peopleCount } from '@/features/spaces/labels'
import { formatDay } from '@/lib/dates'
import { notify } from '@/lib/notify'
import { exportSummaryQuery, restoreBook, type RestoreSummary } from './queries'

type RestoreDialogProps = {
  file: File
  summary: RestoreSummary
  open: boolean
  onClose: () => void
}

/** "Replace everything in your book?": what the export holds; type your email to go on. */
export function RestoreDialog({ file, summary, open, onClose }: RestoreDialogProps) {
  const queryClient = useQueryClient()
  const email = useQuery(currentUserQuery).data?.email ?? ''
  const current = useQuery(exportSummaryQuery).data
  const [typed, setTyped] = useState('')
  const emailId = useId()
  const restore = useMutation({
    mutationFn: () => restoreBook(queryClient, file, typed),
    onSuccess: (restored) => {
      onClose()
      notify({
        title: 'Your book is restored',
        description: `${peopleCount(restored.people)} and ${countOf(restored.spaces, 'space')} are back.`,
      })
    },
  })
  // Only a guard against restoring by accident; the server checks the email itself.
  const confirmed = email !== '' && typed.trim().toLowerCase() === email.toLowerCase()

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => !next && !restore.isPending && onClose()}
      title="Replace everything in your book?"
      description="Everything in your book now is deleted and replaced with this export. This can't be undone."
      confirmLabel={restore.isPending ? 'Restoring…' : 'Restore'}
      busy={!confirmed || restore.isPending}
      onConfirm={() => restore.mutate()}
    >
      <div className="mt-3 rounded-card border border-line bg-card px-4 py-3">
        <p className="font-medium">
          {summary.name}'s book ({summary.email})
        </p>
        <p className="type-small text-ink-soft">
          {[
            peopleCount(summary.people),
            countOf(summary.spaces, 'space'),
            countOf(summary.photos, 'photo'),
          ].join(' · ')}
        </p>
        <p className="mt-1 type-meta text-ink-faint">
          Exported {formatDay(summary.exported_at.slice(0, 10))}
        </p>
      </div>
      {current && (
        <p className="mt-3 type-small text-ink-soft">
          You have {peopleCount(current.people)} in your book now. They go, with everything you
          wrote about them.
        </p>
      )}
      <div className="mt-4 flex flex-col gap-1.5">
        <Label htmlFor={emailId}>Type your email to confirm</Label>
        <Input
          id={emailId}
          type="email"
          placeholder={email}
          autoComplete="off"
          spellCheck={false}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
      </div>
      {restore.error && (
        <p role="alert" className="mt-2 type-small text-danger">
          {restore.error.message}
        </p>
      )}
    </ConfirmDialog>
  )
}
