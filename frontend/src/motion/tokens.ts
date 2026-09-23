/*
 * Motion tokens from the motion spec (design screen 6k). Durations are in seconds, as
 * Motion expects. UI transitions stay at or under 450ms; decorative ink and paper effects
 * at or under 700ms (tokens.test.ts checks both, and that CSS uses the same ease).
 */

/** The default ease: quick start, soft landing. Also --ease-notebook in index.css. */
export const EASE = [0.2, 0.8, 0.2, 1] as const

export const LIMITS = { ui: 0.45, decorative: 0.7 } as const

export const DURATION = {
  /** Card grows into the profile ("page turn"). */
  pageTurn: 0.36,
  /** A page's content fading in. */
  pageFade: 0.16,
  /** Ink underline drawn under something just saved. Decorative. */
  ink: 0.7,
  /** With reduced motion, every effect becomes a plain fade this long. */
  reduced: 0.15,
} as const

/** The one transition used for everything when motion is reduced: a short linear fade. */
export const REDUCED_TRANSITION = { duration: DURATION.reduced, ease: 'linear' } as const
