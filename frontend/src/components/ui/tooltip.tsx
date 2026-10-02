import { Tooltip as Primitive } from 'radix-ui'
import type { ReactNode } from 'react'

/** Mount once near the root: tooltips share one open delay. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <Primitive.Provider delayDuration={400}>{children}</Primitive.Provider>
}

/** A small label on hover or keyboard focus, e.g. a button's shortcut. */
export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <Primitive.Root>
      <Primitive.Trigger asChild>{children}</Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content
          sideOffset={6}
          className="z-50 animate-fade-in rounded-card bg-inverse px-2 py-1 text-sm text-on-inverse shadow-float"
        >
          {content}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  )
}
