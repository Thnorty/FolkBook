/**
 * A small, stable rotation for paper things (photos, sticky notes), so they look hand-placed
 * but don't jump around between renders. Same seed, same angle; between -max and max degrees.
 */
export function tilt(seed: string, max: number): number {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.codePointAt(0)!) | 0
  const unit = (Math.abs(hash) % 1000) / 999 // 0..1
  return Math.round((unit * 2 - 1) * max * 100) / 100
}
