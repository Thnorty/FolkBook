import { RollingNumber } from '@/motion/RollingNumber'
import { nounFor } from './labels'

/** "3 people", the number rolling to its new value when it changes. */
export function Count({ value, one, many }: { value: number; one: string; many?: string }) {
  return (
    <>
      <RollingNumber value={value} /> {nounFor(value, one, many)}
    </>
  )
}
