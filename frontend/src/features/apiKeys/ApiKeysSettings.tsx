import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { formatDay, formatRelativeMoment } from '@/lib/dates'
import { notify } from '@/lib/notify'
import { cn } from '@/lib/utils'
import { apiKeysQuery, revokeApiKey, type ApiKey } from './queries'
import { accessLabel, PRIVATE_LABEL, spacesLabel } from './scope'

/** Name · Scope · Spaces · Last used · Expires · Revoke, from md up (screen 5o). */
const COLUMNS =
  'md:grid md:grid-cols-[minmax(0,1.3fr)_8rem_minmax(0,1fr)_8rem_7rem_6.5rem] md:gap-4'

/** Settings → API keys: your keys, what each can do, and revoking one (screens 5o–5q). */
export function ApiKeysSettings() {
  const keys = useQuery(apiKeysQuery)
  const [, setCreating] = useState<number | null>(null)

  return (
    <SettingsPage title="API keys">
      <div className="-mt-4 flex flex-wrap items-center gap-3">
        <p className="flex-1 basis-64 type-small text-ink-soft">
          For scripts and apps that read or write your book. Each key only sees the spaces you pick.
        </p>
        <Button onClick={() => setCreating(Date.now())}>+ Create key</Button>
      </div>
      {keys.error && <p className="type-small text-danger">{keys.error.message}</p>}
      {keys.data && keys.data.length > 0 && (
        <div className="rounded-card border border-line bg-card">
          <div
            aria-hidden
            className={cn(
              COLUMNS,
              'hidden border-b border-line px-4 py-2 type-label text-ink-faint',
            )}
          >
            <span>Name</span>
            <span>Scope</span>
            <span>Spaces</span>
            <span>Last used</span>
            <span>Expires</span>
          </div>
          <ul aria-label="API keys" className="flex flex-col divide-y divide-line">
            {keys.data.map((key) => (
              <KeyRow key={key.id} apiKey={key} />
            ))}
          </ul>
        </div>
      )}
    </SettingsPage>
  )
}

function KeyRow({ apiKey }: { apiKey: ApiKey }) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const remove = () =>
    revokeApiKey(queryClient, apiKey.id).catch(async (error: Error) => {
      notify({ title: "Couldn't revoke it", description: error.message })
      await queryClient.invalidateQueries({ queryKey: apiKeysQuery.queryKey })
    })

  return (
    <li aria-label={apiKey.name} className="px-4 py-3">
      <div className={cn(COLUMNS, 'flex flex-wrap items-center gap-x-3 gap-y-1')}>
        <div className="min-w-0 basis-full md:basis-auto">
          <p className="truncate font-medium">{apiKey.name}</p>
          <p className="font-mono text-xs text-ink-faint">fb_…{apiKey.last_five}</p>
        </div>
        <p className="type-small">
          <span>{accessLabel(apiKey)}</span>
          {apiKey.include_private && (
            <span className="block type-meta text-ink-soft">{PRIVATE_LABEL}</span>
          )}
        </p>
        <p className="min-w-0 type-small text-ink-soft md:truncate">{spacesLabel(apiKey)}</p>
        <p className="type-meta text-ink-faint">
          {apiKey.last_used_at ? formatRelativeMoment(apiKey.last_used_at) : 'Never used'}
        </p>
        <p className={cn('type-meta', apiKey.expired ? 'text-danger' : 'text-ink-faint')}>
          {expires(apiKey)}
        </p>
        <div className="ml-auto md:ml-0 md:text-right">
          {apiKey.expired ? (
            <Button variant="ghost" onClick={() => void remove()}>
              Delete
            </Button>
          ) : (
            !confirming && (
              <Button variant="ghost" onClick={() => setConfirming(true)}>
                Revoke
              </Button>
            )
          )}
        </div>
      </div>
      {confirming && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-card border border-line bg-paper px-3 py-2">
          <p className="flex-1 basis-56 type-small">
            Revoke “{apiKey.name}”? Anything using it stops working right away.
          </p>
          <Button variant="ghost" autoFocus onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void remove()}>
            Revoke key
          </Button>
        </div>
      )}
    </li>
  )
}

function expires(apiKey: ApiKey): string {
  if (apiKey.expired) return 'Expired'
  if (!apiKey.expires_at) return 'Never'
  return formatDay(apiKey.expires_at.slice(0, 10))
}
