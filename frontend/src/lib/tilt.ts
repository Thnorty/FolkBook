/** A stable number from a string: the same seed always gives the same pick. */
export function seedHash(seed: string): number {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.codePointAt(0)!) | 0
  return Math.abs(hash)
}

/**
 * A small, stable rotation for paper things (photos, sticky notes), so they look hand-placed
 * but don't jump around between renders. Same seed, same angle; between -max and max degrees.
 */
export function tilt(seed: string, max: number): number {
  const unit = (seedHash(seed) % 1000) / 999 // 0..1
  return Math.round((unit * 2 - 1) * max * 100) / 100
}
