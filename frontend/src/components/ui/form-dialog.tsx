import { X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

type FormDialogProps = {
  title: string
  /** The id of the <form> inside, so the phone header's button can submit it. */
  formId: string
  /** The phone header's submit label, e.g. "Save" or "Create". */
  submitLabel: string
  busy: boolean
  onClose: () => void
  children: ReactNode
}

/**
 * A form in a dialog (screens 2a/2b, 4f/4g): centered with a title and ✕ on desktop;
 * a full-screen sheet on phones with Cancel · title · submit across the top.
 */
export function FormDialog({
  title,
  formId,
  submitLabel,
  busy,
  onClose,
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
          className="fixed inset-0 z-30 flex flex-col overflow-hidden bg-paper md:inset-auto md:top-[6vh] md:left-1/2 md:max-h-[88vh] md:w-[calc(100vw-2rem)] md:max-w-xl md:-translate-x-1/2 md:rounded-card md:border md:border-line md:shadow-float"
        >
          <div className="flex flex-none items-center gap-2 border-b border-line px-3 py-2 md:px-5 md:py-3">
            <Button variant="ghost" className="md:hidden" onClick={onClose}>
              Cancel
            </Button>
            <Dialog.Title className="flex-1 text-center type-heading md:text-left">
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
          <div className="flex-1 overflow-y-auto px-4 py-5 md:px-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** The desktop footer of such a form: the shortcut hint, Cancel and the submit button. */
export function FormDialogFooter({
  submitLabel,
  busy,
  onCancel,
  hint,
}: {
  submitLabel: string
  busy: boolean
  onCancel: () => void
  hint: ReactNode
}) {
  return (
    <div className="hidden items-center gap-2 md:flex">
      <span className="type-meta text-ink-faint">{hint}</span>
      <Button type="button" variant="ghost" className="ml-auto" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" disabled={busy}>
        {busy ? 'Saving…' : submitLabel}
      </Button>
    </div>
  )
}
