import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckboxField } from '@/components/ui/checkbox-field'
import { Choice } from '@/components/ui/choice'
import { labelClass } from '@/components/ui/label'
import { selectClass } from '@/components/ui/select'
import { SendTestEmail } from '@/features/mail/SendTestEmail'
import { intervalLabel } from '@/features/person/labels'
import {
  browserTimeZone,
  reminderSettingsQuery,
  saveReminderSettings,
  sendTestDigest,
  type ReminderSettingsIn,
} from './queries'
import { SettingsPage, SettingsPart } from './SettingsPage'

const INTERVALS = [7, 14, 30, 60, 90, 180, 365]
const DIGESTS = [
  { value: 'off', label: 'Off' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
] as const
const WEEKDAYS = [
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
  'Sundays',
]
const BIRTHDAY_NOTICE = [
  { days: 0, label: 'On the day' },
  { days: 1, label: '1 day before' },
  { days: 3, label: '3 days before' },
  { days: 7, label: '1 week before' },
]

/** Keep-in-touch nudges and the reminder email (screen 5r). Each change saves right away. */
export function ReminderSettingsPage() {
  const queryClient = useQueryClient()
  const settings = useQuery(reminderSettingsQuery).data
  const save = useMutation({
    mutationFn: (change: Partial<ReminderSettingsIn>) => saveReminderSettings(queryClient, change),
  })
  if (!settings) return null

  const emailOff = settings.digest === 'off'

  return (
    <SettingsPage title="Reminders">
      <SettingsPart title="Keep-in-touch nudges" note="On Today and in your email digest.">
        <CheckboxField
          // Always in the answer; the type has it optional because a request may leave it out.
          checked={Boolean(settings.nudges_on)}
          disabled={save.isPending}
          onChange={(nudgesOn) => save.mutate({ nudges_on: nudgesOn })}
        >
          Show nudges on Today
        </CheckboxField>
      </SettingsPart>
      <SettingsPart
        title="Default interval"
        note="For everyone without their own. Change it per person on their profile."
      >
        <div className="max-w-xs">
          <label htmlFor="default-interval" className={labelClass}>
            Keep in touch
          </label>
          <select
            id="default-interval"
            value={settings.default_interval_days ?? ''}
            disabled={save.isPending}
            onChange={(event) =>
              save.mutate({ default_interval_days: Number(event.target.value) || null })
            }
            className={selectClass}
          >
            <option value="">Only people I pick</option>
            {INTERVALS.map((days) => (
              <option key={days} value={days}>
                {intervalLabel(days)}
              </option>
            ))}
          </select>
        </div>
      </SettingsPart>

      <SettingsPart
        title="Email digest"
        note={
          settings.email_ready
            ? `People to catch up with and birthdays coming up, sent to ${settings.send_to}.`
            : "This server can't send email yet, so reminders only show on Today. Your admin can set it up."
        }
      >
        <div className="flex flex-wrap items-end gap-3">
          <fieldset>
            <legend className="sr-only">Email digest</legend>
            <div className="flex gap-1.5">
              {DIGESTS.map((option) => (
                <Choice
                  key={option.value}
                  name="digest"
                  look="box"
                  checked={settings.digest === option.value}
                  onChange={() => save.mutate({ digest: option.value })}
                >
                  {option.label}
                </Choice>
              ))}
            </div>
          </fieldset>
          {settings.digest === 'weekly' && (
            <div>
              <label htmlFor="digest-weekday" className="sr-only">
                Day
              </label>
              <select
                id="digest-weekday"
                value={settings.digest_weekday}
                disabled={save.isPending}
                onChange={(event) => save.mutate({ digest_weekday: Number(event.target.value) })}
                className={selectClass}
              >
                {WEEKDAYS.map((day, index) => (
                  <option key={day} value={index}>
                    {day}, 08:00
                  </option>
                ))}
              </select>
            </div>
          )}
          {settings.digest === 'daily' && (
            <p className="min-h-11 content-center text-ink-soft md:min-h-9">Every day, 08:00</p>
          )}
        </div>
        {!emailOff && (
          <p className="type-small text-ink-faint">
            Times are in {settings.time_zone || browserTimeZone()}. Only sent when there&apos;s
            someone in it.
          </p>
        )}
      </SettingsPart>

      <SettingsPart
        title="Memory aids"
        note="Emails pass through your email provider. Turn this off to keep sticky notes inside FolkBook."
      >
        <CheckboxField
          checked={Boolean(settings.include_memory_aids)}
          disabled={save.isPending || emailOff}
          onChange={(include) => save.mutate({ include_memory_aids: include })}
        >
          Include memory aids in emails
        </CheckboxField>
      </SettingsPart>

      <SettingsPart title="Birthdays">
        <div className="max-w-xs">
          <label htmlFor="birthday-notice" className={labelClass}>
            In the email
          </label>
          <select
            id="birthday-notice"
            value={settings.birthdays_days_before ?? ''}
            disabled={save.isPending || emailOff}
            onChange={(event) =>
              save.mutate({
                birthdays_days_before:
                  event.target.value === '' ? null : Number(event.target.value),
              })
            }
            className={selectClass}
          >
            <option value="">Leave them out</option>
            {BIRTHDAY_NOTICE.map((option) => (
              <option key={option.days} value={option.days}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </SettingsPart>

      {settings.email_ready && (
        <div className="border-t border-line pt-5">
          <SendTestEmail goesTo={settings.send_to} send={sendTestDigest} />
        </div>
      )}
      {save.error && <p className="type-small text-danger">{save.error.message}</p>}
    </SettingsPage>
  )
}
