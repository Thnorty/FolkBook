import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { CheckboxField } from '@/components/ui/checkbox-field'
import { Choice } from '@/components/ui/choice'
import { labelClass } from '@/components/ui/label'
import { selectClass } from '@/components/ui/select'
import { intervalLabel } from '@/features/person/labels'
import { setAppearance, useAppearance, type Appearance } from '@/lib/appearance'
import {
  aboutQuery,
  reminderSettingsQuery,
  saveReminderSettings,
  type ReminderSettings,
} from './queries'
import { SettingsPage, SettingsPart } from './SettingsPage'

const INTERVALS = [7, 14, 30, 60, 90, 180, 365]

/** Keep-in-touch nudges: on or off, and how often by default. */
export function ReminderSettingsPage() {
  const queryClient = useQueryClient()
  const settings = useQuery(reminderSettingsQuery).data
  const save = useMutation({
    mutationFn: (change: Partial<ReminderSettings>) =>
      saveReminderSettings(queryClient, { ...settings, ...change }),
  })
  if (!settings) return null

  return (
    <SettingsPage title="Reminders">
      <SettingsPart
        title="Keep-in-touch nudges"
        note="People you haven't talked to in a while show up on Today. Email reminders come later."
      >
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
        {save.error && <p className="type-small text-danger">{save.error.message}</p>}
      </SettingsPart>
    </SettingsPage>
  )
}

const THEMES: { value: Appearance['theme']; label: string }[] = [
  { value: 'light', label: 'Light: paper' },
  { value: 'dark', label: 'Dark: notebook at night' },
  { value: 'system', label: 'Match my device' },
]

/** Theme and motion, for this device (screen 5t). */
export function AppearanceSettings() {
  const { theme, motion } = useAppearance()
  return (
    <SettingsPage title="Appearance">
      <SettingsPart title="Theme" note="Saved on this device.">
        <fieldset>
          <legend className="sr-only">Theme</legend>
          <div className="flex flex-wrap gap-1.5">
            {THEMES.map((option) => (
              <Choice
                key={option.value}
                name="theme"
                look="box"
                checked={theme === option.value}
                onChange={() => setAppearance({ theme: option.value })}
              >
                {option.label}
              </Choice>
            ))}
          </div>
        </fieldset>
      </SettingsPart>
      <SettingsPart
        title="Reduce motion"
        note="Page turns, tears and ink strokes become simple fades. On automatically when your device asks for it."
      >
        <CheckboxField
          checked={motion === 'reduce'}
          onChange={(reduce) => setAppearance({ motion: reduce ? 'reduce' : 'system' })}
        >
          Reduce motion on this device
        </CheckboxField>
      </SettingsPart>
    </SettingsPage>
  )
}

/** The version, the license, and the source code link the AGPL asks for. */
export function AboutSettings() {
  const about = useQuery(aboutQuery).data
  return (
    <SettingsPage title="About">
      <SettingsPart title="FolkBook" note={about && `Version ${about.version}`}>
        <p className="type-small text-ink-soft">
          FolkBook is free software under the GNU Affero General Public License, version 3 or later.
          Everyone using this server can get its source code.
        </p>
        {about && (
          <a
            href={about.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 self-start font-medium text-accent hover:underline"
          >
            Source code
            <ExternalLink aria-hidden className="size-3.5" />
          </a>
        )}
      </SettingsPart>
    </SettingsPage>
  )
}
