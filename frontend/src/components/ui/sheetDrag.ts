// How fast a flick down must be to close the sheet, however short.
const SPEED = 500 // px/s

/** Letting go of a sheet dragged down: past a third of its height, or flicked, it closes. */
export function closesSheet(offsetY: number, velocityY: number, height: number): boolean {
  return offsetY > height / 3 || velocityY > SPEED
}
