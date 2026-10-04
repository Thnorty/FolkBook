import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { countOf } from '@/features/person/labels'
import { peopleCount } from '@/features/spaces/labels'
import { EXPORT_URL, exportSummaryQuery } from './queries'
import { SettingsPage, SettingsPart } from './SettingsPage'

/** Settings → Import / export (screen 5s): take everything with you. */
export function ImportExportSettings() {
  const summary = useQuery(exportSummaryQuery).data
  return (
    <SettingsPage title="Import / export">
      <SettingsPart
        title="Export"
        note="Full exports include your private notes. Keep the file somewhere safe."
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-card border border-line bg-card px-4 py-3.5">
          <div className="min-w-0 flex-1 basis-64">
            <p className="font-medium">Everything</p>
            <p className="type-small text-ink-soft">
              Your people, their links and spaces, and your notes, memory aids and timeline, plus
              all photos.
            </p>
            {summary && (
              <p className="mt-1 type-meta text-ink-faint">
                {peopleCount(summary.people)} · {countOf(summary.photos, 'photo')} · ~
                {fileSize(summary.size)} zip
              </p>
            )}
          </div>
          {/* A plain link: the browser downloads the .zip itself, however big. */}
          <Button asChild>
            <a href={EXPORT_URL} download>
              <Download aria-hidden />
              Export .zip
            </a>
          </Button>
        </div>
      </SettingsPart>
    </SettingsPage>
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
