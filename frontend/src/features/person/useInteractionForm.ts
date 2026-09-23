import { createContext, useContext } from 'react'
import type { Interaction } from './queries'

type InteractionFormControls = {
  /** Log a call, coffee or message with this person. */
  openLog: (personId: string) => void
  /** Change or delete an entry on someone's timeline. */
  openEntry: (interaction: Interaction) => void
}

export const InteractionFormContext = createContext<InteractionFormControls | null>(null)

/** Open the log form from anywhere in the app (a profile, later Today and the graph). */
export function useInteractionForm(): InteractionFormControls {
  const controls = useContext(InteractionFormContext)
  if (!controls) throw new Error('useInteractionForm needs an <InteractionFormProvider> above it.')
  return controls
}
