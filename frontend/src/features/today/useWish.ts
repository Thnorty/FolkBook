import { useQueryClient } from '@tanstack/react-query'
import { deleteInteraction, logInteraction } from '@/features/person/queries'
import { isoTime } from '@/lib/dates'
import { firstNameOf } from '@/lib/names'
import { attempt, notify } from '@/lib/notify'

/** Wish someone happy birthday in one tap: logs "Birthday wishes" for today, with Undo. */
export function useWish() {
  const queryClient = useQueryClient()
  return (person: { id: string; name: string }, today: string) =>
    attempt("Couldn't log that", async () => {
      const entry = await logInteraction(queryClient, {
        person_id: person.id,
        kind: 'message',
        label: 'Birthday wishes',
        occurred_on: today,
        occurred_at: isoTime(),
      })
      notify({
        title: `Logged: birthday wishes to ${firstNameOf(person.name)}`,
        action: {
          label: 'Undo',
          onClick: () =>
            attempt("Couldn't undo that", () => deleteInteraction(queryClient, entry.id)),
        },
      })
    })
}
