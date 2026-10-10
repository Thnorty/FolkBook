import { cn } from '@/lib/utils'

/** A chip that stays pressed: the graph's filters and focus mode's 1 step / 2 steps. */
export function Toggle({
  pressed,
  onClick,
  space,
  children,
}: {
  pressed: boolean
  onClick: () => void
  space?: string
  children: string
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      data-space={space}
      className={cn(
        'flex h-11 cursor-pointer items-center gap-1.5 rounded-full border border-line-input px-3.5 text-md font-medium text-ink-soft hover:border-line-strong md:h-8',
        pressed &&
          (space
            ? 'border-space bg-space text-on-space'
            : 'border-accent bg-accent text-on-accent'),
      )}
    >
      {space && !pressed && <span aria-hidden className="size-2 rounded-full bg-space" />}
      {children}
    </button>
  )
}
