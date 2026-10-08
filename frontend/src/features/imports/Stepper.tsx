import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const STEPS = ['Upload', 'Choose', 'Duplicates', 'Space', 'Done'] as const

/** 1 Upload · 2 Choose · …: done steps get a tick, the current one stands out. */
export function Stepper({ current }: { current: number }) {
  return (
    <ol aria-label="Steps" className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {STEPS.map((label, index) => {
        const done = index < current
        const now = index === current
        return (
          <li
            key={label}
            aria-current={now ? 'step' : undefined}
            className={cn(
              'flex items-center gap-2 type-small',
              now ? 'font-medium text-ink' : 'text-ink-faint',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'flex size-6 items-center justify-center rounded-full border text-xs',
                done && 'border-accent bg-accent text-on-accent',
                now && 'border-ink text-ink',
                !done && !now && 'border-line-strong',
              )}
            >
              {done ? <Check className="size-3.5" /> : index + 1}
            </span>
            {/* On phones only the current step is named, so the row fits. */}
            <span className={cn(!now && 'sr-only sm:not-sr-only')}>{label}</span>
            {done && <span className="sr-only"> (done)</span>}
          </li>
        )
      })}
    </ol>
  )
}
