import { createContext, useContext } from 'react'

type SpaceFormControls = {
  /** Open the form to create a space. */
  openNew: () => void
  /** Open the form to change this space (owners only). */
  openEdit: (spaceId: string) => void
}

export const SpaceFormContext = createContext<SpaceFormControls | null>(null)

/** Open the create / edit space form from anywhere in the app. */
export function useSpaceForm(): SpaceFormControls {
  const controls = useContext(SpaceFormContext)
  if (!controls) throw new Error('useSpaceForm needs a <SpaceFormProvider> above it.')
  return controls
}
