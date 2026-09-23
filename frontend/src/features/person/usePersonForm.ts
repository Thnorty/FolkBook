import { createContext, useContext } from 'react'

type PersonFormControls = {
  /** Open the form to add someone. */
  openNew: () => void
  /** Open the form to edit this person. */
  openEdit: (personId: string) => void
}

export const PersonFormContext = createContext<PersonFormControls | null>(null)

/** Open the add / edit person form from anywhere in the app. */
export function usePersonForm(): PersonFormControls {
  const controls = useContext(PersonFormContext)
  if (!controls) throw new Error('usePersonForm needs a <PersonFormProvider> above it.')
  return controls
}
