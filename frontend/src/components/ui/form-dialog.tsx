import { X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type FormDialogProps = {
  title: string
  /** The id of the <form> inside, so the phone header's button can submit it. */
  formId: string
  /** The phone header's submit label, e.g. "Save" or "Create". */
  submitLabel: string
  busy: boolean
  onClose: () => void
  /** A short form: a sheet from the bottom on phones and a small dialog on desktop (2o/2p). */
  small?: boolean
  children: ReactNode
}

/**
 * A form in a dialog (screens 2a/2b, 4f/4g): centered with a title and ✕ on desktop;
 * a full-screen page on phones with Cancel · title · submit across the top.
 */
export function FormDialog({
  title,
  formId,
  submitLabel,
  busy,
  onClose,
  small = false,
  children,
}: FormDialogProps) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-30 bg-ink/25" />
        <Dialog.Content
          aria-describedby={undefined}
          // Ctrl/⌘+Enter submits from anywhere in the dialog, not just from inside the form
          // (focus can be outside it, e.g. after the photo crop step closes).
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              document.querySelector<HTMLFormElement>(`#${formId}`)?.requestSubmit()
            }
          }}
          className={cn(
            'fixed z-30 flex flex-col overflow-hidden bg-paper md:inset-auto md:top-[6vh] md:left-1/2 md:max-h-[88vh] md:w-[calc(100vw-2rem)] md:-translate-x-1/2 md:rounded-card md:border md:border-line md:shadow-float',
            small
              ? 'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-sheet shadow-float md:top-[18vh] md:max-w-md'
              : 'inset-0 md:max-w-xl',
          )}
        >
          {small && (
            <div
              aria-hidden
              className="mx-auto mt-2.5 h-1 w-10 flex-none rounded-full bg-line-strong md:hidden"
            />
          )}
          <div
            className={cn(
              'flex flex-none items-center gap-2 px-3 py-2 md:px-5 md:py-3',
              small ? 'pl-5 md:pb-0' : 'border-b border-line',
            )}
          >
            {!small && (
              <Button variant="ghost" className="md:hidden" onClick={onClose}>
                Cancel
              </Button>
            )}
            <Dialog.Title
              className={cn('flex-1 type-heading md:text-left', !small && 'text-center')}
            >
              {title}
            </Dialog.Title>
            <Button
              type="submit"
              form={formId}
              variant="ghost"
              className="font-semibold text-accent md:hidden"
              disabled={busy}
            >
              {submitLabel}
            </Button>
            <Dialog.Close asChild>
              <Button variant="ghost" aria-label="Close" className="hidden md:inline-flex">
                <X aria-hidden />
              </Button>
            </Dialog.Close>
          </div>
          <div className={cn('flex-1 overflow-y-auto px-4 py-5 md:px-5', small && 'px-5 pt-3')}>
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/**
 * The footer of such a form: the shortcut hint, Cancel and the submit button on desktop.
 * Phones submit from the header, except in a small form, which ends in a wide button.
 */
export function FormDialogFooter({
  submitLabel,
  busy,
  onCancel,
  hint,
  small = false,
}: {
  submitLabel: string
  busy: boolean
  onCancel: () => void
  hint: ReactNode
  small?: boolean
}) {
  return (
    <div className={cn('items-center gap-2 md:flex', small ? 'flex' : 'hidden')}>
      <span className="hidden type-meta text-ink-faint md:inline">{hint}</span>
      <Button
        type="button"
        variant="ghost"
        className="ml-auto hidden md:inline-flex"
        onClick={onCancel}
      >
        Cancel
      </Button>
      <Button
        type="submit"
        disabled={busy}
        className={cn(small && 'h-12 flex-1 md:h-9 md:flex-none')}
      >
        {busy ? 'Saving…' : submitLabel}
      </Button>
    </div>
  )
}
