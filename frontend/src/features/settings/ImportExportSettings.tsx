import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { selectClass } from '@/components/ui/select'
import { countOf } from '@/features/person/labels'
import { peopleCount } from '@/features/spaces/labels'
import { spacesQuery } from '@/features/spaces/queries'
import { contactsExportUrl, EXPORT_URL, exportSummaryQuery } from './queries'
import { SettingsPage, SettingsPart } from './SettingsPage'

/** Settings → Import / export (screen 5s): take everything with you. */
export function ImportExportSettings() {
  const summary = useQuery(exportSummaryQuery).data
  const spaces = useQuery(spacesQuery).data?.items ?? []
  const [space, setSpace] = useState('')
  return (
    <SettingsPage title="Import / export">
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
          {/* Plain links: the browser downloads the file itself, however big. */}
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
          <DownloadLink href={contactsExportUrl(space || undefined)} secondary>
            Export
          </DownloadLink>
        </ExportRow>
      </SettingsPart>
    </SettingsPage>
  )
}

function ExportRow({
  title,
  description,
  meta,
  children,
}: {
  title: string
  description: string
  meta?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-card border border-line bg-card px-4 py-3.5">
      <div className="min-w-0 flex-1 basis-64">
        <p className="font-medium">{title}</p>
        <p className="type-small text-ink-soft">{description}</p>
        {meta && <p className="mt-1 type-meta text-ink-faint">{meta}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

function DownloadLink({
  href,
  secondary,
  children,
}: {
  href: string
  secondary?: boolean
  children: ReactNode
}) {
  return (
    <Button asChild variant={secondary ? 'secondary' : 'primary'}>
      <a href={href} download>
        <Download aria-hidden />
        {children}
      </a>
    </Button>
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
