import { useQuery } from '@tanstack/react-query'
import { formatDay } from '@/lib/dates'
import { intervalLabel } from './labels'
import { ProfileSection } from './ProfileSection'
import { keepInTouchQuery } from './queries'

/** How often you want to be in touch. Changing it comes with #25. */
export function KeepInTouch({ personId }: { personId: string }) {
  const setting = useQuery(keepInTouchQuery(personId)).data
  if (!setting) return null

  const summary = setting.stopped
    ? 'Off'
    : setting.interval_days
      ? intervalLabel(setting.interval_days)
      : 'No reminders'

  return (
    <ProfileSection title="Keep in touch" meta="private to you">
      <p className="type-heading">{summary}</p>
      {setting.snoozed_until && !setting.stopped && (
        <p className="type-meta text-ink-faint">Snoozed until {formatDay(setting.snoozed_until)}</p>
      )}
    </ProfileSection>
  )
}
