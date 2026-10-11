import { useQuery } from '@tanstack/react-query'
import { SettingsPage, SettingsPart } from '@/features/settings/SettingsPage'
import { AiProviderForm } from './AiProviderForm'
import { aiUsage, providerLine } from './copy'
import { aiSettingsQuery } from './queries'

/** Settings → AI (screens 5n, 5y): your own AI, and the server's for everyone. */
export function AiSettings() {
  const settings = useQuery(aiSettingsQuery)

  if (!settings.data) {
    return (
      <SettingsPage title="AI">
        <p className={settings.isError ? 'text-danger' : 'text-ink-soft'}>
          {settings.error?.message ?? 'Loading…'}
        </p>
      </SettingsPage>
    )
  }

  const { mine, server, can_manage_server: admin } = settings.data
  const usage = aiUsage(settings.data)

  return (
    <SettingsPage title="AI">
      <div>
        <p>
          {usage ? (
            <>
              Quick capture uses <strong>{usage.who}</strong>
              {usage.rest}
            </>
          ) : (
            'AI is off: Quick capture needs a key.'
          )}
        </p>
        <p className="mt-1 type-small text-ink-soft">
          Only used when you press Suggest. Nothing is sent in the background.
        </p>
      </div>

      <SettingsPart title="Only for you">
        <AiProviderForm
          // A fresh form once it's removed, so the fields don't keep old values.
          key={mine ? 'saved' : 'empty'}
          scope="mine"
          current={mine}
          title="Only for you"
          removeQuestion={
            server
              ? "Remove your key? Quick capture will use the server's AI."
              : 'Remove your key? Quick capture will be off.'
          }
        />
      </SettingsPart>

      <SettingsPart title="For everyone on this server">
        {admin ? (
          <AiProviderForm
            key={server ? 'saved' : 'empty'}
            scope="server"
            current={server}
            title="For everyone on this server"
            note="Everyone on this server who hasn't added their own key uses this. Their Quick capture text goes to this provider."
            removeQuestion="Remove the server's AI? Everyone without their own key loses Quick capture."
          />
        ) : (
          <p className="text-ink-soft">
            {server
              ? `The server's AI: ${providerLine(server)}${server.set_by ? `, set up by ${server.set_by}` : ''}.`
              : 'No server AI. Your admin can add one, or add your own key above.'}
          </p>
        )}
      </SettingsPart>
    </SettingsPage>
  )
}
