import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { InkDivider } from '@/components/notebook/InkDivider'
import { Button } from '@/components/ui/button'
import { Choice } from '@/components/ui/choice'
import { Input } from '@/components/ui/input'
import { Label, labelClass } from '@/components/ui/label'
import { notify } from '@/lib/notify'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { SendTestEmail } from './SendTestEmail'
import {
  mailSettingsQuery,
  removeMail,
  saveMail,
  sendTestMail,
  type MailSettings,
  type Smtp,
  type SmtpIn,
} from './queries'

const SECURITY = [
  { value: 'starttls', label: 'STARTTLS' },
  { value: 'ssl', label: 'SSL / TLS' },
  { value: 'none', label: 'None' },
] as const satisfies { value: Smtp['security']; label: string }[]

/** Settings → Email (SMTP), for admins (screen 5w): how this server sends email. */
export function EmailSettings() {
  const settings = useQuery(mailSettingsQuery)

  return (
    <SettingsPage title="Email (SMTP)" note="For reminder digests and password resets.">
      {settings.data ? (
        <>
          {settings.data.source === 'environment' && settings.data.smtp ? (
            <FromEnvironment settings={settings.data} smtp={settings.data.smtp} />
          ) : (
            <SmtpForm
              // A fresh form once it's removed, so the fields don't keep old values.
              key={settings.data.smtp ? 'saved' : 'empty'}
              settings={settings.data}
            />
          )}
          <p className="type-small text-ink-soft">
            Links in emails open <span className="font-mono">{settings.data.links_to}</span>. If
            that&apos;s not where people open FolkBook, set FOLKBOOK_URL on the server.
          </p>
        </>
      ) : (
        <p className={settings.isError ? 'text-danger' : 'text-ink-soft'}>
          {settings.error?.message ?? 'Loading…'}
        </p>
      )}
    </SettingsPage>
  )
}

/** Settings from FOLKBOOK_SMTP_*: shown, not changed here. */
function FromEnvironment({ settings, smtp }: { settings: MailSettings; smtp: Smtp }) {
  const rows = [
    ['Server', `${smtp.host}:${smtp.port}`],
    ['Security', SECURITY.find((option) => option.value === smtp.security)?.label],
    ['Username', smtp.username || '—'],
    ['Password', smtp.has_password ? 'Set' : '—'],
    ['From', smtp.from_address || '—'],
  ]
  return (
    <div className="flex flex-col gap-4">
      <p>
        Set in the server&apos;s environment (FOLKBOOK_SMTP_* in .env). Change them there and
        restart FolkBook.
      </p>
      <dl className="grid max-w-xl grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-2">
        {rows.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="type-label text-ink-faint">{term}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <SendTestEmail goesTo={settings.send_to} send={() => sendTestMail(null)} />
    </div>
  )
}

/** The SMTP settings an admin saves. */
function SmtpForm({ settings }: { settings: MailSettings }) {
  const queryClient = useQueryClient()
  const form = useRef<HTMLFormElement>(null)
  const current = settings.smtp
  const [host, setHost] = useState(current?.host ?? '')
  const [port, setPort] = useState(String(current?.port ?? 587))
  const [security, setSecurity] = useState<Smtp['security']>(current?.security ?? 'starttls')
  const [username, setUsername] = useState(current?.username ?? '')
  const [password, setPassword] = useState('')
  const [from, setFrom] = useState(current?.from_address ?? '')
  const [replacing, setReplacing] = useState(false)
  const [removing, setRemoving] = useState(false)

  // A saved password stays unless you type a new one. It never goes to another server or
  // user, so changing either asks for it again.
  const keepsPassword =
    Boolean(current?.has_password) &&
    !current?.password_unreadable &&
    !replacing &&
    host.trim().toLowerCase() === current?.host.toLowerCase() &&
    username.trim() === current?.username

  const smtp = (): SmtpIn => ({
    host: host.trim(),
    port: Number(port),
    security,
    username: username.trim(),
    from_address: from.trim(),
    ...(!keepsPassword && { password }),
  })

  const save = useMutation({
    mutationFn: () => saveMail(queryClient, smtp()),
    onSuccess: () => {
      setReplacing(false)
      setPassword('')
      notify({ title: 'Email settings saved' })
    },
  })
  const remove = useMutation({ mutationFn: () => removeMail(queryClient) })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate()
  }
  const error = save.error ?? remove.error

  return (
    <form ref={form} aria-label="Email (SMTP)" onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-3">
        <div>
          <Label htmlFor="smtp-host">SMTP host</Label>
          <Input
            id="smtp-host"
            value={host}
            onChange={(event) => setHost(event.target.value)}
            placeholder="smtp.fastmail.com"
            required
            autoComplete="off"
          />
        </div>
        <div>
          <Label htmlFor="smtp-port">Port</Label>
          <Input
            id="smtp-port"
            type="number"
            inputMode="numeric"
            min={1}
            max={65535}
            value={port}
            onChange={(event) => setPort(event.target.value)}
            required
          />
        </div>
      </div>

      <fieldset>
        <legend className={labelClass}>Security</legend>
        <div className="flex gap-1.5">
          {SECURITY.map((option) => (
            <Choice
              key={option.value}
              name="smtp-security"
              look="box"
              className="flex-1"
              checked={security === option.value}
              onChange={() => setSecurity(option.value)}
            >
              {option.label}
            </Choice>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="smtp-username">Username</Label>
          <Input
            id="smtp-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="off"
          />
        </div>
        <div>
          <Label htmlFor={keepsPassword ? undefined : 'smtp-password'}>Password</Label>
          {keepsPassword ? (
            <div className="flex min-h-11 items-center gap-3 md:min-h-9">
              <span className="text-ink-soft">Saved</span>
              <Button type="button" variant="ghost" onClick={() => setReplacing(true)}>
                Replace
              </Button>
            </div>
          ) : (
            <Input
              id="smtp-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="app password"
              // Not "off", which browsers ignore: this keeps the FolkBook login password out.
              autoComplete="new-password"
            />
          )}
          {current?.password_unreadable && (
            <p className="mt-1 type-small text-danger">
              The saved password can&apos;t be read anymore (the server&apos;s secret changed).
              Enter it again.
            </p>
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="smtp-from">From</Label>
        <Input
          id="smtp-from"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          placeholder="FolkBook <folkbook@example.com>"
          required
          autoComplete="off"
        />
      </div>

      <InkDivider seed="Send a test email" />
      <div className="flex flex-wrap items-start gap-3">
        <SendTestEmail
          goesTo={settings.send_to}
          // The form as it is, saved or not; the browser checks the fields first.
          canSend={() => Boolean(form.current?.reportValidity())}
          send={() => sendTestMail(smtp())}
        />
        <div className="ml-auto flex gap-2">
          {current && !removing && (
            <Button type="button" variant="ghost" onClick={() => setRemoving(true)}>
              Remove
            </Button>
          )}
          <Button type="submit" disabled={save.isPending}>
            Save
          </Button>
        </div>
      </div>

      {removing && (
        <div className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-card p-3">
          <p className="type-small">
            Remove the email settings? Reminders will only show on Today, and password resets go
            back to links from an admin.
          </p>
          <Button
            type="button"
            variant="danger"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            Remove email
          </Button>
          <Button type="button" variant="ghost" onClick={() => setRemoving(false)}>
            Cancel
          </Button>
        </div>
      )}

      {error && <p className="type-small text-danger">{error.message}</p>}
    </form>
  )
}
