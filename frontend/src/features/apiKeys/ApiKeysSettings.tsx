import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ApiError } from '@/api/errors'
import { Button } from '@/components/ui/button'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { formatDay, formatRelativeMoment } from '@/lib/dates'
import { notify } from '@/lib/notify'
import { cn } from '@/lib/utils'
import { useClosing } from '@/motion/useClosing'
import { CreateKeyDialog } from './CreateKeyDialog'
import { apiKeysQuery, revokeApiKey, type ApiKey } from './queries'
import { accessLabel, PRIVATE_LABEL, spacesLabel } from './scope'

/** Name · Scope · Spaces · Last used · Expires · Revoke, from md up (screen 5o). */
const COLUMNS =
  'md:grid md:grid-cols-[minmax(0,1.6fr)_7rem_minmax(0,1fr)_7rem_6.5rem_5.5rem] md:gap-3'

/** Settings → API keys: your keys, what each can do, and revoking one (screens 5o–5q). */
export function ApiKeysSettings() {
  const keys = useQuery(apiKeysQuery)
  // Each opening is new (`key`), so a key shown earlier is never shown again.
  const [creating, setCreating] = useState<number | null>(null)
  const [shown, closing] = useClosing(creating)
  // After a key is removed, focus goes to the next key's button (or Create key), not the page.
  const removing = useRef<{ id: string; index: number } | null>(null)
  const list = useRef<HTMLUListElement>(null)
  const create = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const removed = removing.current
    if (!removed || keys.data?.some((key) => key.id === removed.id)) return
    const rows = list.current?.querySelectorAll('li') ?? []
    const next = rows[Math.min(removed.index, rows.length - 1)]
    ;(next?.querySelector('button') ?? create.current)?.focus()
    removing.current = null
  }, [keys.data])

  return (
    <SettingsPage title="API keys">
      <div className="-mt-4 flex flex-wrap items-center gap-3">
        <p className="flex-1 basis-64 type-small text-ink-soft">
          For scripts and apps that read or write your book. Each key only sees the spaces you pick.
        </p>
        <Button ref={create} onClick={() => setCreating(Date.now())}>
          + Create key
        </Button>
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
          <ul ref={list} aria-label="API keys" className="flex flex-col divide-y divide-line">
            {keys.data.map((key, index) => (
              <KeyRow
                key={key.id}
                apiKey={key}
                onRemoving={(done) => (removing.current = done ? { id: key.id, index } : null)}
              />
            ))}
          </ul>
        </div>
      )}
      {shown && <CreateKeyDialog key={shown} open={!closing} onClose={() => setCreating(null)} />}
    </SettingsPage>
  )
}

type KeyRowProps = {
  apiKey: ApiKey
  /** True when removing starts, false if it failed: the page moves focus once the row is gone. */
  onRemoving: (removing: boolean) => void
}

function KeyRow({ apiKey, onRemoving }: KeyRowProps) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const revokeButton = useRef<HTMLButtonElement>(null)
  const cancelled = useRef(false)
  useEffect(() => {
    if (confirming || !cancelled.current) return
    cancelled.current = false
    revokeButton.current?.focus()
  }, [confirming])
  // A double click mustn't send a second DELETE, whose 404 would say it failed.
  const [removing, setRemoving] = useState(false)
  const sent = useRef(false)
  const remove = async () => {
    if (sent.current) return
    sent.current = true
    setRemoving(true)
    onRemoving(true)
    try {
      await revokeApiKey(queryClient, apiKey.id)
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        // Revoked on another device: what was asked for is done.
        notify({ title: `That key was already ${apiKey.expired ? 'deleted' : 'revoked'}` })
      } else {
        const verb = apiKey.expired ? 'delete' : 'revoke'
        notify({ title: `Couldn't ${verb} it`, description: (error as Error).message })
        sent.current = false
        setRemoving(false)
        onRemoving(false)
      }
      await queryClient.invalidateQueries({ queryKey: apiKeysQuery.queryKey })
    }
  }

  return (
    <li aria-label={apiKey.name} className="px-4 py-3">
      <div className={cn(COLUMNS, 'flex flex-wrap items-center gap-x-3 gap-y-1')}>
        <div className="min-w-0 basis-full md:basis-auto">
          <p className="font-medium break-words">{apiKey.name}</p>
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
          {apiKey.last_used_at ? (
            <>
              <ColumnName>Used </ColumnName>
              {formatRelativeMoment(apiKey.last_used_at)}
            </>
          ) : (
            'Never used'
          )}
        </p>
        <p className={cn('type-meta', apiKey.expired ? 'text-danger' : 'text-ink-faint')}>
          {apiKey.expired ? (
            'Expired'
          ) : (
            <>
              <ColumnName>Expires </ColumnName>
              {apiKey.expires_at ? formatDay(apiKey.expires_at.slice(0, 10)) : 'Never'}
            </>
          )}
        </p>
        <div className="ml-auto md:ml-0 md:text-right">
          {apiKey.expired ? (
            <Button variant="ghost" disabled={removing} onClick={() => void remove()}>
              Delete
            </Button>
          ) : (
            !confirming && (
              <Button ref={revokeButton} variant="ghost" onClick={() => setConfirming(true)}>
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
          <Button
            variant="ghost"
            autoFocus
            disabled={removing}
            onClick={() => {
              cancelled.current = true
              setConfirming(false)
            }}
          >
            Cancel
          </Button>
          <Button variant="danger" disabled={removing} onClick={() => void remove()}>
            Revoke key
          </Button>
        </div>
      )}
    </li>
  )
}

/** The column's name before a value: shown on phone cards, which have no column heads, and
 * read out on desktop, where the heads are hidden from screen readers. */
function ColumnName({ children }: { children: ReactNode }) {
  return <span className="md:sr-only">{children}</span>
}
