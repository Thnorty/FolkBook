import { LazyMotion, MotionConfig } from 'motion/react'
import type { ReactNode } from 'react'
import { useAppearance } from '@/lib/appearance'
import { EASE } from './tokens'

const loadFeatures = () => import('./features').then((module) => module.default)

/**
 * Motion for the whole app. Loads its features in the background (`m` components, strict),
 * gives every animation the notebook ease, and turns transforms off when the device
 * or the in-app setting asks for reduced motion.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  const { motion } = useAppearance()
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig
        reducedMotion={motion === 'reduce' ? 'always' : 'user'}
        transition={{ ease: EASE }}
      >
        {children}
      </MotionConfig>
    </LazyMotion>
  )
}
