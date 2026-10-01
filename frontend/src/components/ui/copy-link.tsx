import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** A link to pass on: shown in full, selectable, with a Copy button that says when it worked. */
export function CopyLink({ link, label }: { link: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () =>
    navigator.clipboard.writeText(link).then(
      () => setCopied(true),
      () => setCopied(false), // no clipboard here: the field is selectable anyway
    )

  return (
    <div className="flex gap-2">
      <Input readOnly value={link} aria-label={label} onFocus={(event) => event.target.select()} />
      <Button
        variant="secondary"
        onClick={() => void copy()}
        aria-label={copied ? 'Copied' : 'Copy the link'}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      </Button>
    </div>
  )
}
