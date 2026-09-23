import { toast } from 'sonner'
import { ToastCard } from '@/components/ui/toast'

const DEFAULT_DURATION = 6000

type Notice = {
  title: string
  description?: string
  /** One action, e.g. Undo. Clicking it also closes the toast. */
  action?: { label: string; onClick: () => void }
  duration?: number
}

/** Show a toast. Needs the <Toaster /> rendered once near the root. */
export function notify({ title, description, action, duration = DEFAULT_DURATION }: Notice) {
  return toast.custom(
    (id) => (
      <ToastCard
        title={title}
        description={description}
        duration={duration}
        onClose={() => toast.dismiss(id)}
        action={
          action && {
            label: action.label,
            onClick: () => {
              action.onClick()
              toast.dismiss(id)
            },
          }
        }
      />
    ),
    { duration },
  )
}
