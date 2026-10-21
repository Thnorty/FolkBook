import { useEffect, useRef } from 'react'

/**
 * After a row is removed from a list, focus goes to the next row's button (or `fallback`,
 * e.g. the list's Create button, once the last one is gone), not back to the page.
 * Call `removing(id, index)` when a row starts going, `removing(null)` if it failed.
 */
export function useFocusAfterRemoval(
  ids: string[] | undefined,
  list: React.RefObject<HTMLUListElement | null>,
  fallback: React.RefObject<HTMLButtonElement | null>,
) {
  const removed = useRef<{ id: string; index: number } | null>(null)
  useEffect(() => {
    const gone = removed.current
    if (!gone || ids?.includes(gone.id)) return
    const rows = list.current?.querySelectorAll('li') ?? []
    const next = rows[Math.min(gone.index, rows.length - 1)]
    ;(next?.querySelector('button') ?? fallback.current)?.focus()
    removed.current = null
  }, [ids, list, fallback])
  return (id: string | null, index = 0) => {
    removed.current = id === null ? null : { id, index }
  }
}
