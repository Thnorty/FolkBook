import { useState } from 'react'

/*
 * "Show all" in a big notebook's graph belongs to the device, like the theme: kept in
 * localStorage. Unreadable or blocked storage (private windows) means faraway spaces fold.
 */

const KEY = 'folkbook.graph.showAll'

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true'
  } catch {
    return false
  }
}

function save(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, 'true')
    else localStorage.removeItem(KEY)
  } catch {
    // Not kept: it still holds for this visit.
  }
}

/** Whether this device shows everyone in a big notebook, and a way to change it. */
export function useShowAll(): [boolean, (on: boolean) => void] {
  const [showAll, setShowAll] = useState(load)
  return [
    showAll,
    (on) => {
      save(on)
      setShowAll(on)
    },
  ]
}
