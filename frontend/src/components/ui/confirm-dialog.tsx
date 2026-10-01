import { AlertDialog } from 'radix-ui'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  busy?: boolean
  cancelLabel?: string
  /** More about what will happen, under the description (e.g. what goes with it). */
  children?: ReactNode
}

/** "Are you sure?" for things that can't be undone. Cancel has the focus. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  busy = false,
  cancelLabel = 'Cancel',
  children,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-ink/25" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-40 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card border border-line bg-paper p-5 shadow-float">
          <AlertDialog.Title className="type-title">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-ink-soft">
            {description}
          </AlertDialog.Description>
          {children}
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="ghost">{cancelLabel}</Button>
            </AlertDialog.Cancel>
            <Button
              className="bg-danger text-on-accent hover:bg-danger"
              disabled={busy}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
