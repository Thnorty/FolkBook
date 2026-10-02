import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { labelClass } from '@/components/ui/label'
import { formatDay, formatRelativeDay, isoDay } from '@/lib/dates'
import { intervalLabel } from './labels'
import { ProfileSection } from './ProfileSection'
import { keepInTouchQuery, saveKeepInTouch, type KeepInTouchSetting } from './queries'

const INTERVALS = [7, 14, 30, 60, 90, 180, 365]
const DEFAULT = 'default'
const STOP = 'stop'

/** How often you want to be in touch, and when they come up on Today next (screen 1b). */
export function KeepInTouch({ personId }: { personId: string }) {
  const queryClient = useQueryClient()
  const setting = useQuery(keepInTouchQuery(personId)).data
  const [changing, setChanging] = useState(false)
  const save = useMutation({
    mutationFn: (changes: Partial<KeepInTouchSetting>) =>
      saveKeepInTouch(queryClient, personId, {
        interval_days: setting?.interval_days,
        snoozed_until: setting?.snoozed_until,
        stopped: setting?.stopped,
        ...changes,
      }),
  })
  if (!setting) return null

  const yourDefault = setting.default_interval_days
  const interval = setting.interval_days ?? yourDefault
  const summary = setting.stopped
    ? 'Not reminding you'
    : interval
      ? intervalLabel(interval)
      : 'No reminders'
  const value = setting.stopped ? STOP : String(setting.interval_days ?? DEFAULT)
  const today = isoDay()
  const snoozed = setting.snoozed_until && setting.snoozed_until > today && !setting.stopped

  const choose = (choice: string) =>
    save.mutate(
      choice === STOP
        ? { stopped: true }
        : { stopped: false, interval_days: choice === DEFAULT ? null : Number(choice) },
    )

  return (
    <ProfileSection
      title="Keep in touch"
      meta="private to you"
      action={
        <Button variant="ghost" aria-expanded={changing} onClick={() => setChanging(!changing)}>
          {changing ? 'Done' : 'Change'}
        </Button>
      }
    >
      <p className="type-heading">{summary}</p>
      {setting.next_nudge_on && !snoozed && (
        <p className="flex items-center gap-1.5 type-small text-ink-soft">
          <Bell aria-hidden className="size-3.5 text-ink-faint" />
          {setting.next_nudge_on <= today
            ? 'Due now: on Today'
            : `Next nudge ${formatRelativeDay(setting.next_nudge_on)}`}
        </p>
      )}
      {snoozed && (
        <p className="flex items-center gap-1.5 type-small text-ink-soft">
          <BellOff aria-hidden className="size-3.5 text-ink-faint" />
          Snoozed until {formatDay(setting.snoozed_until!)}
          <Button
            variant="ghost"
            className="ml-1 h-8 px-2"
            onClick={() => save.mutate({ snoozed_until: null })}
          >
            Wake up
          </Button>
        </p>
      )}
      {changing && (
        <div>
          <label htmlFor={`keep-in-touch-${personId}`} className={labelClass}>
            How often
          </label>
          <select
            id={`keep-in-touch-${personId}`}
            value={value}
            onChange={(event) => choose(event.target.value)}
            disabled={save.isPending}
            className="h-11 w-full rounded-card border border-line-input bg-card px-3 text-input outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-focus-glow md:h-10"
          >
            <option value={DEFAULT}>
              {yourDefault
                ? `Your default (${intervalLabel(yourDefault).toLowerCase()})`
                : 'Your default (none)'}
            </option>
            {INTERVALS.map((days) => (
              <option key={days} value={days}>
                {intervalLabel(days)}
              </option>
            ))}
            <option value={STOP}>Never: stop reminding me</option>
          </select>
          {save.error && <p className="mt-1 type-small text-danger">{save.error.message}</p>}
        </div>
      )}
    </ProfileSection>
  )
}
