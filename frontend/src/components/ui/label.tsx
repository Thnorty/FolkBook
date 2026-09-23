import { Label as LabelPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn(
        'mb-1.5 block text-xs font-medium tracking-[0.06em] text-ink-faint uppercase',
        className,
      )}
      {...props}
    />
  )
}
