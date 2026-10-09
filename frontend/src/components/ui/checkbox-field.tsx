import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type CheckboxFieldProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  /** A line under the label, e.g. what's off by default and why. */
  note: ReactNode
  /** Classes for the whole field, e.g. a box around it. */
  className?: string
  children: ReactNode
}

/** A checkbox with its label and a note under it (Share space, Create API key). */
export function CheckboxField({
  checked,
  onChange,
  note,
  className,
  children,
}: CheckboxFieldProps) {
  return (
    <label className={cn('flex items-start gap-2.5', className)}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 size-4 accent-accent"
      />
      <span>
        {children}
        <span className="block type-small text-ink-faint">{note}</span>
      </span>
    </label>
  )
}
