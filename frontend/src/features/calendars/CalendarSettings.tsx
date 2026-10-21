import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmInPlace } from '@/components/ui/confirm-in-place'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { limitedToLabel } from '@/features/spaces/labels'
import { formatRelativeMoment } from '@/lib/dates'
import { useConfirmInPlace } from '@/lib/useConfirmInPlace'
import { useFocusAfterRemoval } from '@/lib/useFocusAfterRemoval'
import { useRemoveOnce } from '@/lib/useRemoveOnce'
import { useClosing } from '@/motion/useClosing'
import { CreateCalendarDialog } from './CreateCalendarDialog'
import { calendarFeedsQuery, revokeCalendarFeed, type CalendarFeed } from './queries'

/** Settings → Calendar: private links that put birthdays in a calendar app (#117). */
export function CalendarSettings() {
  const feeds = useQuery(calendarFeedsQuery)
  // Each opening is new (`key`), so a link shown earlier is never shown again.
  const [creating, setCreating] = useState<number | null>(null)
  const [shown, closing] = useClosing(creating)
  const list = useRef<HTMLUListElement>(null)
  const create = useRef<HTMLButtonElement>(null)
  const removing = useFocusAfterRemoval(
    feeds.data?.map((feed) => feed.id),
    list,
    create,
  )

  return (
    <SettingsPage title="Calendar">
      <div className="-mt-4 flex flex-wrap items-center gap-3">
        <p className="flex-1 basis-64 type-small text-ink-soft">
          Birthdays in the calendar app you already use. Each link is private: anyone with it can
          see the names and birthdays in it.
        </p>
        <Button ref={create} onClick={() => setCreating(Date.now())}>
          + New calendar link
        </Button>
      </div>
      {feeds.error && <p className="type-small text-danger">{feeds.error.message}</p>}
      {feeds.data && feeds.data.length > 0 && (
        <ul
          ref={list}
          aria-label="Calendar links"
          className="flex flex-col divide-y divide-line rounded-card border border-line bg-card"
        >
          {feeds.data.map((feed, index) => (
            <FeedRow
              key={feed.id}
              feed={feed}
              onRemoving={(started) => removing(started ? feed.id : null, index)}
            />
          ))}
        </ul>
      )}
      {shown && (
        <CreateCalendarDialog key={shown} open={!closing} onClose={() => setCreating(null)} />
      )}
    </SettingsPage>
  )
}

type FeedRowProps = { feed: CalendarFeed; onRemoving: (removing: boolean) => void }

function FeedRow({ feed, onRemoving }: FeedRowProps) {
  const queryClient = useQueryClient()
  const { confirming, button: revokeButton, ask, cancel } = useConfirmInPlace()
  const { removing, run: remove } = useRemoveOnce({
    remove: () => revokeCalendarFeed(queryClient, feed.id),
    alreadyGone: 'That link was already revoked',
    failed: "Couldn't revoke it",
    onRemoving,
    refresh: () => queryClient.invalidateQueries({ queryKey: calendarFeedsQuery.queryKey }),
  })

  return (
    <li aria-label={feed.name} className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1 basis-48">
          <p className="font-medium break-words">{feed.name}</p>
          <p className="type-small text-ink-soft">{limitedToLabel(feed, 'Everyone you can see')}</p>
        </div>
        <p className="type-meta text-ink-faint">
          {feed.last_fetched_at
            ? `Last used ${formatRelativeMoment(feed.last_fetched_at)}`
            : 'Not used yet'}
        </p>
        {!confirming && (
          <Button ref={revokeButton} variant="ghost" onClick={ask}>
            Revoke
          </Button>
        )}
      </div>
      {confirming && (
        <ConfirmInPlace
          confirmLabel="Revoke link"
          busy={removing}
          onCancel={cancel}
          onConfirm={() => void remove()}
        >
          Revoke “{feed.name}”? Calendars using this link stop updating.
        </ConfirmInPlace>
      )}
    </li>
  )
}
