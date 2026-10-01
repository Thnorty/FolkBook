import { createContext, useContext } from 'react'
import type { Relationship } from './queries'

type ConnectionFormControls = {
  /** Connect someone to this person. */
  openConnect: (personId: string) => void
  /** Change how a link reads, seen from this person's profile ("Change type"). */
  openChange: (personId: string, link: Relationship) => void
}

export const ConnectionFormContext = createContext<ConnectionFormControls | null>(null)

/** Open the connect form from anywhere in the app (a profile, later the graph). */
export function useConnectionForm(): ConnectionFormControls {
  const controls = useContext(ConnectionFormContext)
  if (!controls) throw new Error('useConnectionForm needs a <ConnectionFormProvider> above it.')
  return controls
}
