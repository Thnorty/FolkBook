import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

// Cloud models answer in seconds; a local one on a laptop can take much longer.
const SLOW_AFTER = 10_000

type ReadingStepProps = {
  text: string
  /** Why it failed, in the app's words; null while the AI is still reading. */
  error: string | null
  onCancel: () => void
  onRetry: () => void
  onEditText: () => void
}

/** Screen 2f: the AI is reading the text, or couldn't. */
export function ReadingStep({ text, error, onCancel, onRetry, onEditText }: ReadingStepProps) {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (error) return
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER)
    return () => clearTimeout(timer)
  }, [error])

  return (
    <div className="flex flex-col gap-4">
      <p className="notebook-lines rounded-card border border-line bg-card pt-1 pr-4 text-lg whitespace-pre-wrap text-ink-soft">
        {text}
      </p>
      {error ? (
        <div role="alert" className="flex flex-col gap-3">
          <p className="text-danger">{error}</p>
          <div className="flex gap-2">
            <Button type="button" onClick={onRetry}>
              Try again
            </Button>
            <Button type="button" variant="secondary" onClick={onEditText}>
              Edit text
            </Button>
          </div>
        </div>
      ) : (
        <div role="status" className="flex flex-col items-center gap-3">
          <p className="type-heading">Reading it back…</p>
          {slow && <p className="type-small text-ink-soft">Local models can take a minute.</p>}
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  )
}
