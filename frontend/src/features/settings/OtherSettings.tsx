import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { CheckboxField } from '@/components/ui/checkbox-field'
import { Choice } from '@/components/ui/choice'
import { setAppearance, useAppearance, type Appearance } from '@/lib/appearance'
import { aboutQuery } from './queries'
import { SettingsPage, SettingsPart } from './SettingsPage'

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
