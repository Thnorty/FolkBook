import type { ComponentProps, ReactNode, Ref } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type FileButtonProps = {
  accept: string
  onFile: (file: File | undefined) => void
  variant?: ComponentProps<typeof Button>['variant']
  className?: string
  disabled?: boolean
  /** The hidden input, e.g. to focus it. */
  ref?: Ref<HTMLInputElement>
  children: ReactNode
}

/**
 * A button that opens the file picker: a label around a hidden file input, so it works
 * with the keyboard and its text names the input.
 */
export function FileButton({
  accept,
  onFile,
  variant = 'secondary',
  className,
  disabled,
  ref,
  children,
}: FileButtonProps) {
  return (
    <Button
      asChild
      variant={variant}
      // On the Button, so its variant's classes and these are merged (later ones win).
      className={cn(
        'cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      <label>
        {children}
        <input
          ref={ref}
          type="file"
          accept={accept}
          disabled={disabled}
          className="sr-only"
          onChange={(event) => {
            onFile(event.target.files?.[0])
            // So choosing the same file again still counts.
            event.target.value = ''
          }}
        />
      </label>
    </Button>
  )
}
