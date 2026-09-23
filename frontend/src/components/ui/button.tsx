import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  // 44px tall on touch screens, 36px from md up (screen 1a; mobile screens use 44px targets).
  'inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-card px-4 text-md font-medium whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-50 md:h-9 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-on-accent shadow-photo hover:bg-accent-hover',
        secondary: 'border border-line-strong text-ink hover:bg-hover',
        ghost: 'px-3 text-ink-soft hover:text-ink',
        danger: 'px-3 text-danger hover:bg-danger-hover',
      },
    },
    defaultVariants: { variant: 'primary' },
  },
)

type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child (e.g. a link) with button styles instead of a <button>. */
    asChild?: boolean
  }

export function Button({ className, variant, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot.Root : 'button'
  return <Component className={cn(buttonVariants({ variant }), className)} {...props} />
}
