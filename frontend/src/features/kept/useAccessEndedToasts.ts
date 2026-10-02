import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { notify } from '@/lib/notify'
import { useDismissed } from '@/lib/useDismissed'
import { firstNames, whatEnded } from './labels'
import { accessEndedQuery } from './queries'
import { useReviewKept } from './useReviewKept'

/** "Defne stopped sharing Hackathon 2026 — you kept Tom, Ola and Jin." Once per device;
 * the card stays on Today until dismissed (screen 4n). */
export function useAccessEndedToasts() {
  const notices = useQuery(accessEndedQuery).data
  const [toasted, markToasted] = useDismissed('folkbook.accessEnded.toasted')
  const review = useReviewKept()
  // Effects run twice in development; never toast the same one twice.
  const shown = useRef(new Set<string>())

  useEffect(() => {
    for (const notice of notices ?? []) {
      if (toasted.includes(notice.id) || shown.current.has(notice.id)) continue
      shown.current.add(notice.id)
      markToasted(notice.id)
      const kept = notice.kept
      notify({
        title:
          kept.length > 0
            ? `${whatEnded(notice)} — you kept ${firstNames(kept)}.`
            : `${whatEnded(notice)}.`,
        action: kept.length > 0 ? { label: 'Review', onClick: () => review(kept) } : undefined,
      })
    }
  }, [notices, toasted, markToasted, review])
}
