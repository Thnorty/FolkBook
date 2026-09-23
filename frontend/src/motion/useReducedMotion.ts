import { useReducedMotion as useOsReducedMotion } from 'motion/react'
import { useAppearance } from '@/lib/appearance'

/** True when motion should be reduced: the device asks for it, or the in-app setting does. */
export function useReducedMotion(): boolean {
  const os = useOsReducedMotion()
  return useAppearance().motion === 'reduce' || os === true
}
