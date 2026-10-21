import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

type ConfirmInPlaceProps = {
  children: ReactNode
  confirmLabel: string
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}

/** "Revoke this? …" with Cancel and the action, shown in the row instead of a dialog. */
export function ConfirmInPlace({
  children,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: ConfirmInPlaceProps) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-card border border-line bg-paper px-3 py-2">
      <p className="flex-1 basis-56 type-small">{children}</p>
      <Button variant="ghost" autoFocus disabled={busy} onClick={onCancel}>
        Cancel
      </Button>
      <Button variant="danger" disabled={busy} onClick={onConfirm}>
        {confirmLabel}
      </Button>
    </div>
  )
}
