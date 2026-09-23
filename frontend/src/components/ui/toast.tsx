import { X } from 'lucide-react'
import { Toaster as Sonner } from 'sonner'

/** Where toasts appear. Render once, near the root. Show one with `notify()`. */
export function Toaster() {
  return <Sonner position="bottom-center" toastOptions={{ unstyled: true }} />
}

type ToastCardProps = {
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  onClose: () => void
  /** How long the toast stays, for the countdown line. */
  duration: number
}

/** A toast: an ink card with an optional action and a line counting down. */
export function ToastCard({ title, description, action, onClose, duration }: ToastCardProps) {
  return (
    <div className="relative flex w-[min(var(--width),calc(100vw-32px))] items-center gap-2 overflow-hidden rounded-card bg-inverse py-3 pr-1.5 pl-4 font-sans shadow-float">
      <div className="min-w-0 flex-1">
        <p className="text-input font-medium text-on-inverse">{title}</p>
        {description && <p className="mt-0.5 text-sm text-on-inverse-soft">{description}</p>}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="min-h-11 flex-none cursor-pointer rounded-card focus-visible:outline-inverse-accent border border-on-inverse-soft/60 px-4 text-md font-semibold text-inverse-accent"
        >
          {action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="flex size-11 flex-none cursor-pointer items-center justify-center rounded-card focus-visible:outline-inverse-accent text-on-inverse-soft hover:text-on-inverse"
      >
        <X aria-hidden className="size-4" />
      </button>
      <div
        aria-hidden
        className="toast-countdown absolute bottom-0 left-0 h-0.5 w-full origin-left bg-inverse-accent reduced:hidden"
        style={{ animationDuration: `${duration}ms` }}
      />
    </div>
  )
}
