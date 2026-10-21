import { useEffect, useRef, useState } from 'react'

/** Ask before a destructive action right where its button is. Cancelling puts focus back on
 * the button (`button`), which the question had replaced. */
export function useConfirmInPlace() {
  const [confirming, setConfirming] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const cancelled = useRef(false)
  useEffect(() => {
    if (confirming || !cancelled.current) return
    cancelled.current = false
    button.current?.focus()
  }, [confirming])
  return {
    confirming,
    button,
    ask: () => setConfirming(true),
    cancel: () => {
      cancelled.current = true
      setConfirming(false)
    },
  }
}
