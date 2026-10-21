import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

/** How long what was just made stays put before a submit can close it: the press (or the
 * second tap of a double tap) that made it mustn't also close it, unseen. */
const SETTLE_MS = 500

/**
 * Make a secret that's shown once (an API key, a calendar link) from a dialog. The answer is
 * kept only in the dialog's state: closing forgets it, and the mutation keeps nothing, since
 * the mutation cache outlives the dialog.
 */
export function useCreateShownOnce<In, Out>(
  create: (body: In) => Promise<Out>,
  onClose: () => void,
) {
  const [created, setCreated] = useState<Out | null>(null)
  // Ctrl/⌘+Enter submits with requestSubmit(), which a disabled button doesn't stop.
  const sent = useRef(false)
  const mutation = useMutation({
    mutationFn: async (body: In) => setCreated(await create(body)),
    onError: () => (sent.current = false),
  })
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    if (!created) return
    const timer = setTimeout(() => setSettled(true), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [created])

  return {
    created,
    settled,
    pending: mutation.isPending,
    error: mutation.error?.message,
    send: (body: In) => {
      if (sent.current) return
      sent.current = true
      mutation.mutate(body)
    },
    // Closing while it's being made would make one nobody ever sees.
    close: () => {
      if (!mutation.isPending) onClose()
    },
  }
}
