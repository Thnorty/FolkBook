import { useEffect, useState } from 'react'
import { DURATION } from './tokens'

// A little longer than the exit animation, so it always finishes first.
const LINGER_MS = DURATION.dialogOut * 1000 + 60

/**
 * For a dialog shown while `value` is set: keeps the last value a moment after it's
 * cleared, so the dialog can animate out. Returns [what to show, whether it's closing].
 *
 *   const [shown, closing] = useClosing(open)
 *   {shown && <SomeDialog {...shown} open={!closing} />}
 */
export function useClosing<T>(value: T | null): [T | null, boolean] {
  const [shown, setShown] = useState(value)
  if (value !== null && value !== shown) setShown(value)

  useEffect(() => {
    if (value !== null || shown === null) return
    const timer = setTimeout(() => setShown(null), LINGER_MS)
    return () => clearTimeout(timer)
  }, [value, shown])

  return [shown, value === null && shown !== null]
}
