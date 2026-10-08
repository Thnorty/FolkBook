// How far, or how fast, a card must be thrown to count.
const DISTANCE = 120 // px
const SPEED = 500 // px/s

/** A drag on a Fill in the blanks card: right saves, left skips, anything less snaps back. */
export function swipeOf(offsetX: number, velocityX: number): 'save' | 'skip' | null {
  if (offsetX > DISTANCE || velocityX > SPEED) return 'save'
  if (offsetX < -DISTANCE || velocityX < -SPEED) return 'skip'
  return null
}
