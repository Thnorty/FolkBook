import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

/** A round button over a drawing: zoom in, zoom out, fit. */
export function CanvasButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      variant="secondary"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="size-9 bg-card px-0"
    >
      {children}
    </Button>
  )
}
