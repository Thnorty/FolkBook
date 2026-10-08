import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { SettingsPart } from '@/features/settings/SettingsPage'
import { peopleCount } from '@/features/spaces/labels'
import { formatDay } from '@/lib/dates'
import { useClosing } from '@/motion/useClosing'
import { recentImportsQuery, type RecentImport } from './queries'
import { UndoImportDialog } from './UndoImportDialog'

const SHOWN = 5

/** Settings → Import / export → Recent imports: show an import's people, or undo it. */
export function RecentImports() {
  const imports = useQuery(recentImportsQuery).data?.items.slice(0, SHOWN) ?? []
  // Each opening is new (`at`), so the dialog asks again rather than reusing an answer
  // from an earlier opening that's still closing.
  const [undoing, setUndoing] = useState<{ batch: RecentImport; at: number } | null>(null)
  const [shown, closing] = useClosing(undoing)
  if (imports.length === 0) return null
  return (
    <SettingsPart title="Recent imports">
      <ul
        aria-label="Recent imports"
        className="flex flex-col divide-y divide-line rounded-card border border-line bg-card"
      >
        {imports.map((batch) => (
          <li key={batch.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <div className="min-w-0 flex-1 basis-56">
              <p className="truncate font-medium">{batch.file_name}</p>
              <p className="type-meta text-ink-faint">
                {formatDay(batch.created_at.slice(0, 10))} · {peopleCount(batch.added)} added
                {batch.undone_at && ' · undone'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="ghost">
                <Link to="/people" search={{ import: batch.id }}>
                  Show these people
                </Link>
              </Button>
              {!batch.undone_at && (
                <Button variant="secondary" onClick={() => setUndoing({ batch, at: Date.now() })}>
                  Undo this import…
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {shown && (
        <UndoImportDialog
          key={shown.at}
          batch={shown.batch}
          open={!closing}
          onClose={() => setUndoing(null)}
        />
      )}
    </SettingsPart>
  )
}
