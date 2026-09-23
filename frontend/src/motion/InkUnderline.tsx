import * as m from 'motion/react-m'
import { cn } from '@/lib/utils'
import { DURATION, EASE } from './tokens'
import { useReducedMotion } from './useReducedMotion'

/**
 * An ink line drawn under something just saved, left to right like a pen stroke
 * (motion spec, screen 6k). It draws when it appears: give it a new `key` on each
 * save, and never show it for autosaves. With reduced motion it appears fully drawn.
 */
export function InkUnderline({ className }: { className?: string }) {
  const reduced = useReducedMotion()
  return (
    <m.div
      aria-hidden
      initial={reduced ? false : { scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ duration: DURATION.ink, ease: EASE }}
      className={cn('h-0.5 origin-left rounded-full bg-accent', className)}
    />
  )
}
