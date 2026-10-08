import { useState } from 'react'
import { FileButton } from '@/components/ui/file-button'
import { cn } from '@/lib/utils'

// The server's limit (backend/imports/services.py MAX_FILE_MB): it refuses bigger files.
const MAX_FILE_MB = 20

type UploadStepProps = {
  onFile: (file: File) => void
  busy: boolean
  error?: string
}

/** Step 1 (screen 4p): drop a .vcf here or choose one. */
export function UploadStep({ onFile, busy, error }: UploadStepProps) {
  const [over, setOver] = useState(false)
  return (
    <div className="flex flex-col gap-4">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setOver(false)
          const file = event.dataTransfer.files[0]
          if (file) onFile(file)
        }}
        className={cn(
          'flex flex-col items-center gap-3 rounded-card border-2 border-dashed border-line-strong bg-card px-6 py-10 text-center',
          over && 'border-accent',
        )}
      >
        <span aria-hidden className="rounded-card border border-line px-2.5 py-1 type-label">
          VCF
        </span>
        <p className="type-heading">Drop a .vcf file here</p>
        <FileButton
          accept=".vcf,text/vcard,text/x-vcard"
          onFile={(file) => file && onFile(file)}
          disabled={busy}
        >
          {busy ? 'Reading…' : 'Choose a file'}
        </FileButton>
        <p className="max-w-md type-small text-ink-soft">
          On your phone: Contacts → select all → Share / Export → vCard. Google Contacts: Export →
          vCard.
        </p>
      </div>
      {error && (
        <p role="alert" className="type-small text-danger">
          {error}
        </p>
      )}
      <p className="type-small text-ink-soft">
        Up to {MAX_FILE_MB} MB. A bigger export? Export it without photos, or in parts.
      </p>
      <p className="type-meta text-ink-faint">Nothing is added until the last step</p>
    </div>
  )
}
