import { Check, Copy } from 'lucide-react'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCopy } from '@/lib/useCopy'

/** A link to pass on: shown in full, selectable, with a Copy button that says when it worked. */
export function CopyLink({ link, label }: { link: string; label: string }) {
  const field = useRef<HTMLInputElement>(null)
  const { copied, copy } = useCopy(link)

  return (
    <div className="flex gap-2">
      <Input
        ref={field}
        readOnly
        value={link}
        aria-label={label}
        onFocus={(event) => event.target.select()}
      />
      <Button
        variant="secondary"
        onClick={() => copy(field.current)}
        aria-label={copied ? 'Copied' : 'Copy the link'}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      </Button>
    </div>
  )
}
