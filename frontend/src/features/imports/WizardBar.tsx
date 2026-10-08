import type { ReactNode } from 'react'

/**
 * A step's Back / Continue row: at the top on phones (as their header, screen 4u), at
 * the bottom from md up (4q), and kept in view on both.
 */
export function WizardBar({ start, children }: { start?: ReactNode; children: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 order-first -mx-4 flex flex-wrap items-center gap-2 border-b border-line bg-paper px-4 py-3 md:order-last md:top-auto md:bottom-0 md:mx-0 md:border-t md:border-b-0 md:px-0">
      {start && <div className="basis-full type-meta text-ink-faint sm:basis-auto">{start}</div>}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{children}</div>
    </div>
  )
}
