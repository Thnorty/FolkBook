import { useRef, useState } from 'react'
import { ApiError } from '@/api/errors'
import { notify } from '@/lib/notify'

type RemoveOnceOptions = {
  remove: () => Promise<void>
  /** Toast when it was already gone (removed on another device): what was asked is done. */
  alreadyGone: string
  /** Toast title when removing fails; the error's message goes under it. */
  failed: string
  /** True when removing starts, false if it failed: the list can move focus once it's gone. */
  onRemoving: (removing: boolean) => void
  /** Reload the list after a failure, so it shows what's really there. */
  refresh: () => Promise<unknown>
}

/** Remove something from a list once, even on a double click, whose second DELETE would
 * answer 404 and say it failed. */
export function useRemoveOnce({
  remove,
  alreadyGone,
  failed,
  onRemoving,
  refresh,
}: RemoveOnceOptions) {
  const [removing, setRemoving] = useState(false)
  const sent = useRef(false)
  const run = async () => {
    if (sent.current) return
    sent.current = true
    setRemoving(true)
    onRemoving(true)
    try {
      await remove()
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        notify({ title: alreadyGone })
      } else {
        notify({ title: failed, description: (error as Error).message })
        sent.current = false
        setRemoving(false)
        onRemoving(false)
      }
      await refresh()
    }
  }
  return { removing, run }
}
