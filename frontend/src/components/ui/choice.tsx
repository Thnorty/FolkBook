import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** The outline of a picked box, also for a field that sits in a row of boxes. */
export const pickedBoxClass = 'border-accent text-ink ring-3 ring-focus-glow'

type ChoiceProps = {
  /** The radio group's name. */
  name: string
  /** A radio (one of the row) or a checkbox (any of the row, e.g. spaces). */
  type?: 'radio' | 'checkbox'
  checked: boolean
  onChange: () => void
  /** A chip fills in when picked; a box gets outlined (screens 2k, 2o). */
  look?: 'chip' | 'box'
  /** Classes for the whole option, e.g. to stretch it across a row. */
  className?: string
  children: ReactNode
}

/** One option in a row of choices: a radio button (or checkbox) drawn as a chip or a box. */
export function Choice({
  name,
  type = 'radio',
  checked,
  onChange,
  look = 'chip',
  className,
  children,
}: ChoiceProps) {
  return (
    <label className={cn('cursor-pointer', className)}>
      <input
        type={type}
        name={name}
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        className={cn(
          'flex min-h-11 items-center justify-center border border-line-input py-1.5 text-md font-medium text-ink-soft peer-focus-visible:ring-3 peer-focus-visible:ring-focus-glow hover:border-line-strong md:min-h-9',
          look === 'chip'
            ? 'rounded-full px-3.5 peer-checked:border-accent peer-checked:bg-accent peer-checked:text-on-accent'
            : 'rounded-card bg-card px-3',
          look === 'box' && checked && pickedBoxClass,
        )}
      >
        {children}
        {look === 'chip' && checked && (
          <span aria-hidden className="ml-1">
            ✓
          </span>
        )}
      </span>
    </label>
  )
}
