import { X } from 'lucide-react'
import { animate, useDragControls, useMotionValue, type PanInfo } from 'motion/react'
import * as m from 'motion/react-m'
import { Dialog } from 'radix-ui'
import { useRef, type PointerEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip } from '@/components/ui/tooltip'
import { isWideScreen } from '@/lib/media'
import { cn } from '@/lib/utils'
import { DURATION, EASE } from '@/motion/tokens'
import { useReducedMotion } from '@/motion/useReducedMotion'
import { closesSheet } from './sheetDrag'

/** Ctrl/⌘+Enter submits from anywhere in the dialog; Esc closes it. */
const SUBMIT = { key: 'Enter', mod: true }
const CANCEL = { key: 'Esc' }

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
  /** False while it animates out (useClosing); it's open as long as it's shown otherwise. */
  open?: boolean
  /** False: a click beside the dialog leaves it open (✕ and Esc still close it). */
  closeOnOutsideClick?: boolean
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
  open = true,
  closeOnOutsideClick = true,
  children,
}: FormDialogProps) {
  const drag = useSheetDrag(small && !isWideScreen(), onClose)
  return (
    <Dialog.Root open={open} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-30 animate-fade-in bg-scrim data-[state=closed]:animate-fade-out" />
        <Dialog.Content
          asChild
          aria-describedby={undefined}
          onInteractOutside={(event) => !closeOnOutsideClick && event.preventDefault()}
          // Ctrl/⌘+Enter submits from anywhere in the dialog, not just from inside the form
          // (focus can be outside it, e.g. after the photo crop step closes).
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              document.querySelector<HTMLFormElement>(`#${formId}`)?.requestSubmit()
            }
          }}
        >
          <m.div
            {...drag.sheet}
            className={cn(
              'fixed z-30 flex animate-sheet-up flex-col overflow-hidden bg-paper data-[state=closed]:animate-sheet-down reduced:animate-fade-in reduced:data-[state=closed]:animate-fade-out md:inset-auto md:animate-dialog-in md:data-[state=closed]:animate-dialog-out md:top-[6vh] md:left-1/2 md:max-h-[88vh] md:w-[calc(100vw-2rem)] md:-translate-x-1/2 md:rounded-card md:border md:border-line md:shadow-float',
              small
                ? 'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-sheet shadow-float md:top-[8vh] md:max-h-[84vh] md:max-w-md'
                : 'inset-0 md:max-w-xl',
            )}
          >
            {small && (
              <div
                aria-hidden
                {...drag.grip}
                className={cn(
                  'mx-auto mt-2.5 h-1 w-10 flex-none rounded-full bg-line-strong md:hidden',
                  drag.grip && 'touch-none',
                )}
              />
            )}
            <div
              {...drag.grip}
              className={cn(
                'flex flex-none items-center gap-2 px-3 py-2 md:px-5 md:py-3',
                small ? 'pl-5 md:pb-0' : 'border-b border-line',
                drag.grip && 'touch-none',
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
          </m.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/**
 * A phone sheet you can drag down to close, by its handle or title row (so scrolling or
 * typing in the form never starts a drag). Let go past a third of the way, or flick it, and
 * it closes like Esc; otherwise it slides back. Dragging up gives only a little.
 */
function useSheetDrag(on: boolean, onClose: () => void) {
  const controls = useDragControls()
  const y = useMotionValue(0)
  const sheet = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  if (!on) return { sheet: {}, grip: undefined }

  return {
    sheet: {
      ref: sheet,
      style: { y },
      drag: 'y' as const,
      dragListener: false,
      dragControls: controls,
      dragConstraints: { top: 0 },
      dragElastic: { top: 0.05 },
      dragMomentum: false,
      onDragEnd: (_: unknown, { offset, velocity }: PanInfo) => {
        if (closesSheet(offset.y, velocity.y, sheet.current?.offsetHeight ?? 0)) onClose()
        else if (reduced) y.set(0)
        else animate(y, 0, { duration: DURATION.card, ease: EASE })
      },
    },
    grip: { onPointerDown: (event: PointerEvent) => controls.start(event) },
  }
}

/**
 * The footer of such a form: Cancel and the submit button on desktop, their shortcuts
 * (Esc, Ctrl/⌘+Enter) in tooltips. Phones submit from the header, except in a small
 * form, which ends in a wide button. `start` (e.g. Delete, or a short note) takes the
 * bottom left.
 */
export function FormDialogFooter({
  submitLabel,
  busy,
  onCancel,
  small = false,
  start,
}: {
  submitLabel: string
  busy: boolean
  onCancel: () => void
  small?: boolean
  start?: ReactNode
}) {
  return (
    <div className={cn('items-center gap-2 md:flex', small ? 'flex' : 'hidden')}>
      {start}
      <Tooltip content={<Kbd shortcut={CANCEL} />}>
        <Button
          type="button"
          variant="ghost"
          className="ml-auto hidden md:inline-flex"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </Tooltip>
      <Tooltip content={<Kbd shortcut={SUBMIT} />}>
        <Button
          type="submit"
          disabled={busy}
          className={cn(small && 'h-12 flex-1 md:h-9 md:flex-none')}
        >
          {busy ? 'Saving…' : submitLabel}
        </Button>
      </Tooltip>
    </div>
  )
}

/** A short note at the footer's left, e.g. "Parent links never end." */
export function FooterNote({ children }: { children: ReactNode }) {
  return <span className="hidden type-meta text-ink-faint md:inline">{children}</span>
}
