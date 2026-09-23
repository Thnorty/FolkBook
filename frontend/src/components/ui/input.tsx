import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-11 w-full min-w-0 rounded-card border border-line-input bg-card px-3 text-input text-ink transition-[border-color,box-shadow] outline-none placeholder:text-ink-faint disabled:cursor-not-allowed disabled:opacity-50 md:h-10',
        'focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-focus-glow',
        'aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  )
}
