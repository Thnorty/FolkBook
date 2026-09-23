import { Toaster as Sonner } from 'sonner'

/** Where toasts appear. Render once, near the root. Show one with `notify()`. */
export function Toaster() {
  return <Sonner position="bottom-center" toastOptions={{ unstyled: true }} />
}

type ToastCardProps = {
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  /** How long the toast stays, for the countdown line. */
  duration: number
}

/** A toast: an ink card with an optional action and a line counting down. */
export function ToastCard({ title, description, action, duration }: ToastCardProps) {
  return (
    <div className="relative flex w-[min(var(--width),calc(100vw-32px))] items-center font-sans gap-3 overflow-hidden rounded-card bg-inverse px-4 py-3 shadow-float">
      <div className="min-w-0 flex-1">
        <p className="text-input font-medium text-on-inverse">{title}</p>
        {description && <p className="mt-0.5 text-sm text-on-inverse-soft">{description}</p>}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="min-h-11 flex-none cursor-pointer rounded-card border border-on-inverse-soft/60 px-4 text-md font-semibold text-inverse-accent"
        >
          {action.label}
        </button>
      )}
      <div
        aria-hidden
        className="toast-countdown absolute bottom-0 left-0 h-0.5 w-full origin-left bg-inverse-accent motion-reduce:hidden"
        style={{ animationDuration: `${duration}ms` }}
      />
    </div>
  )
}
