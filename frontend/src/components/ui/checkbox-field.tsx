import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type CheckboxFieldProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  /** A line under the label, e.g. what's off by default and why. */
  note?: ReactNode
  /** Its name in a form, for forms read with FormData. */
  name?: string
  disabled?: boolean
  /** Classes for the whole field, e.g. a box around it or a smaller text size. */
  className?: string
  children: ReactNode
}

/** A checkbox with its label, and optionally a note under it. */
export function CheckboxField({
  checked,
  onChange,
  note,
  name,
  disabled,
  className,
  children,
}: CheckboxFieldProps) {
  return (
    <label className={cn('flex gap-2.5', note ? 'items-start' : 'items-center', className)}>
      <input
        type="checkbox"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className={cn('size-4 accent-accent', note && 'mt-1')}
      />
      {note ? (
        <span>
          {children}
          <span className="block type-small text-ink-faint">{note}</span>
        </span>
      ) : (
        children
      )}
    </label>
  )
}
