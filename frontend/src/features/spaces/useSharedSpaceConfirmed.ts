import { useDismissed } from '@/lib/useDismissed'

/** Shared spaces the user said not to ask about again when adding people to them. */
export function useSharedSpaceConfirmed() {
  return useDismissed('folkbook.sharedSpaceConfirmed')
}
