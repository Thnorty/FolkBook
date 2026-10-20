import { useEffect, useState } from 'react'

export type PartOfDay = 'morning' | 'afternoon' | 'evening' | 'night'

// When each part of the day starts, in hours on the device's clock.
const STARTS: [number, PartOfDay][] = [
  [5, 'morning'],
  [12, 'afternoon'],
  [17, 'evening'],
  [22, 'night'],
]

/** Morning, afternoon, evening or night at `at`, on the device's clock. */
export function partOfDay(at: Date): PartOfDay {
  let part: PartOfDay = 'night'
  for (const [start, name] of STARTS) if (at.getHours() >= start) part = name
  return part
}

/** When the next part of the day after `at` starts. */
function nextStart(at: Date): Date {
  const start = STARTS.find(([hour]) => hour > at.getHours())
  return start
    ? new Date(at.getFullYear(), at.getMonth(), at.getDate(), start[0])
    : new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1, STARTS[0][0])
}

/** The part of the day now; it moves on by itself when a page stays open across a start. */
export function usePartOfDay(): PartOfDay {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setTimeout(() => setNow(new Date()), nextStart(now).getTime() - now.getTime())
    return () => clearTimeout(timer)
  }, [now])
  return partOfDay(now)
}
