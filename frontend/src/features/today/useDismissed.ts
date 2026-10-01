import { useCallback, useState } from 'react'

function read(key: string): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(stored) ? stored.filter((id) => typeof id === 'string') : []
  } catch {
    return [] // storage blocked or garbled: show everything again
  }
}

/**
 * Cards dismissed on this device, by id. A convenience, so it lives in the browser:
 * another device shows them until dismissed there too.
 */
export function useDismissed(key: string): [string[], (id: string) => void] {
  const [ids, setIds] = useState(() => read(key))
  const dismiss = useCallback(
    (id: string) =>
      setIds((current) => {
        const next = [...current, id]
        try {
          localStorage.setItem(key, JSON.stringify(next))
        } catch {
          // Can't remember it here; it's still hidden until the page reloads.
        }
        return next
      }),
    [key],
  )
  return [ids, dismiss]
}
