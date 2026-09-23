type Box = { left: number; top: number; width: number; height: number }

/**
 * The transform that puts an element at `to` visually at `from`: centre on centre, scaled
 * by height (so a name keeps its line). Null when there's nothing to measure yet.
 */
export function flyOffset(from: Box, to: Box): { x: number; y: number; scale: number } | null {
  if (!to.width || !to.height || !from.height) return null
  return {
    x: from.left + from.width / 2 - (to.left + to.width / 2),
    y: from.top + from.height / 2 - (to.top + to.height / 2),
    scale: from.height / to.height,
  }
}
