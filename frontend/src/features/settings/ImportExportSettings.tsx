import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Upload } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { DownloadLink } from '@/components/ui/download-link'
import { FileButton } from '@/components/ui/file-button'
import { selectClass } from '@/components/ui/select'
import { RecentImports } from '@/features/imports/RecentImports'
import { countOf } from '@/features/person/labels'
import { peopleCount } from '@/features/spaces/labels'
import { spacesQuery } from '@/features/spaces/queries'
import { cn } from '@/lib/utils'
import { useClosing } from '@/motion/useClosing'
import {
  checkRestore,
  contactsExportUrl,
  EXPORT_URL,
  exportSummaryQuery,
  type RestoreSummary,
} from './queries'
import { RestoreDialog } from './RestoreDialog'
import { SettingsPage, SettingsPart } from './SettingsPage'

/** Settings → Import / export (screen 5s): take everything with you, or bring it back. */
export function ImportExportSettings() {
  const summary = useQuery(exportSummaryQuery).data
  const spaces = useQuery(spacesQuery).data?.items ?? []
  const [space, setSpace] = useState('')
  return (
    <SettingsPage title="Import / export">
      <SettingsPart title="Import">
        <ExportRow
          title="Contacts (.vcf)"
          description="From your phone or Google Contacts. You choose who comes in."
        >
          <Button asChild>
            <Link to="/people/import">
              <Upload aria-hidden />
              Import contacts
            </Link>
          </Button>
        </ExportRow>
      </SettingsPart>
      <RecentImports />
      <SettingsPart
        title="Export"
        note="Full exports include your private notes. Keep the file somewhere safe."
      >
        <ExportRow
          title="Everything"
          description="Your people, their links and spaces, and your notes, memory aids and timeline, plus all photos."
          meta={
            summary &&
            `${peopleCount(summary.people)} · ${countOf(summary.photos, 'photo')} · ~${fileSize(summary.size)} zip`
          }
        >
          <DownloadLink href={EXPORT_URL}>Export .zip</DownloadLink>
        </ExportRow>
        <ExportRow
          title="Contacts only (.vcf)"
          description="Name, phone, email, birthday. For your phone or another app."
        >
          <div className="w-44">
            <select
              aria-label="Which people"
              value={space}
              onChange={(event) => setSpace(event.target.value)}
              className={selectClass}
            >
              <option value="">All spaces</option>
              {spaces.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <DownloadLink href={contactsExportUrl(space || undefined)} variant="secondary">
            Export
          </DownloadLink>
        </ExportRow>
      </SettingsPart>
      <SettingsPart title="Restore">
        <RestoreRow />
      </SettingsPart>
    </SettingsPage>
  )
}

/** Choose a .zip; the server checks it before the dialog asks you to confirm. */
function RestoreRow() {
  const [picked, setPicked] = useState<{ file: File; summary: RestoreSummary } | null>(null)
  const [shown, closing] = useClosing(picked)
  const check = useMutation({
    mutationFn: checkRestore,
    onSuccess: (summary, file) => setPicked({ file, summary }),
  })
  return (
    <>
      <ExportRow
        title="Restore from a full export (.zip)"
        description="For moving to a new server. Brings back people, links, spaces, notes, memory aids and photos."
        className="border-danger/30"
        footer={
          <>
            {check.error && (
              <p role="alert" className="mt-3 type-small text-danger">
                {check.error.message}
              </p>
            )}
            <p className="mt-3 flex gap-2 border-t border-danger/15 pt-3 type-small text-danger">
              <b aria-hidden className="font-semibold">
                !
              </b>
              Replaces everything in your book. Nothing is merged. You'll type your email to
              confirm.
            </p>
          </>
        }
      >
        <FileButton
          accept=".zip,application/zip"
          onFile={(file) => file && check.mutate(file)}
          disabled={check.isPending}
          className="border-danger/45 text-danger hover:bg-danger-hover"
        >
          {check.isPending ? 'Checking…' : 'Choose .zip'}
        </FileButton>
      </ExportRow>
      {shown && <RestoreDialog {...shown} open={!closing} onClose={() => setPicked(null)} />}
    </>
  )
}

function ExportRow({
  title,
  description,
  meta,
  footer,
  className,
  children,
}: {
  title: string
  description: string
  meta?: ReactNode
  footer?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('rounded-card border border-line bg-card px-4 py-3.5', className)}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <p className="font-medium">{title}</p>
          <p className="type-small text-ink-soft">{description}</p>
          {meta && <p className="mt-1 type-meta text-ink-faint">{meta}</p>}
        </div>
        <div className="flex items-center gap-2">{children}</div>
      </div>
      {footer}
    </div>
  )
}

/** "84 MB", "320 kB", in the user's language. */
function fileSize(bytes: number): string {
  const [value, unit] = bytes >= 1e6 ? [bytes / 1e6, 'megabyte'] : [bytes / 1e3, 'kilobyte']
  return new Intl.NumberFormat(undefined, {
    style: 'unit',
    unit,
    maximumFractionDigits: 0,
  }).format(Math.max(1, value))
}
