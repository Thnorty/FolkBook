import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { currentUserQuery } from '@/api/session'
import { Polaroid } from '@/components/notebook/Polaroid'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { personQuery } from '@/features/person/queries'
import { usePersonForm } from '@/features/person/usePersonForm'
import { formatBirthday, formatRelativeDay, isoDay } from '@/lib/dates'
import { notify } from '@/lib/notify'
import { changePassword, devicesQuery, signOutDevice, signOutOtherDevices } from './queries'
import { SettingsPage, SettingsPart } from './SettingsPage'

/** Your Me, email, password and signed-in devices (screen 5m). */
export function ProfileSettings() {
  const user = useQuery(currentUserQuery).data
  if (!user) return null
  return (
    <SettingsPage title="Profile & account">
      {user.me && <MeCard personId={user.me.id} />}
      <SettingsPart title="Email" note="You log in with it.">
        <p>{user.email}</p>
      </SettingsPart>
      <PasswordPart />
      <DevicesPart />
    </SettingsPage>
  )
}

function MeCard({ personId }: { personId: string }) {
  const me = useQuery(personQuery(personId)).data
  const { openEdit } = usePersonForm()
  if (!me) return null
  return (
    <div className="flex items-center gap-4">
      <Polaroid seed={me.id} photoUrl={me.photo?.thumbnail_url} size="md" />
      <div className="min-w-0 flex-1">
        <p className="type-heading">{me.name}</p>
        <p className="type-small text-ink-soft">
          {me.birthday && `Birthday ${formatBirthday(me.birthday)} · `}the “Me” in your graph
        </p>
      </div>
      <Button variant="secondary" onClick={() => openEdit(me.id)}>
        Edit Me profile
      </Button>
    </div>
  )
}

function PasswordPart() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [mismatch, setMismatch] = useState(false)
  const change = useMutation({
    mutationFn: (body: { current_password: string; new_password: string }) =>
      changePassword(queryClient, body),
    onSuccess: () => {
      setOpen(false)
      notify({ title: 'Password changed', description: 'Your other devices are signed out.' })
    },
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const next = String(form.get('new'))
    setMismatch(next !== form.get('again'))
    if (next === form.get('again')) {
      change.mutate({ current_password: String(form.get('current')), new_password: next })
    }
  }

  return (
    <SettingsPart
      title="Password"
      note="Changing it signs you out on every other device."
      action={
        !open && (
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Change password
          </Button>
        )
      }
    >
      {open && (
        <form onSubmit={submit} className="flex max-w-sm flex-col gap-4">
          <div>
            <Label htmlFor="current">Current password</Label>
            <Input
              id="current"
              name="current"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <div>
            <Label htmlFor="new">New password</Label>
            <Input
              id="new"
              name="new"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <div>
            <Label htmlFor="again">New password again</Label>
            <Input id="again" name="again" type="password" autoComplete="new-password" required />
          </div>
          {(mismatch || change.error) && (
            <p role="alert" className="type-small text-danger">
              {mismatch ? "The new passwords don't match." : change.error?.message}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={change.isPending}>
              Save password
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </SettingsPart>
  )
}

function DevicesPart() {
  const queryClient = useQueryClient()
  const devices = useQuery(devicesQuery).data ?? []
  const others = devices.filter((device) => !device.is_current)
  const signOut = (write: () => Promise<unknown>) =>
    write().catch((error: Error) =>
      notify({ title: "Couldn't sign out", description: error.message }),
    )

  return (
    <SettingsPart
      title="Signed-in devices"
      action={
        others.length > 0 && (
          <Button
            variant="secondary"
            onClick={() => void signOut(() => signOutOtherDevices(queryClient))}
          >
            Sign out everywhere else
          </Button>
        )
      }
    >
      <ul className="flex flex-col divide-y divide-line">
        {devices.map((device) => (
          <li key={device.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p>
                {device.device}
                {device.is_current && (
                  <span className="ml-2 type-meta text-accent">This device</span>
                )}
              </p>
              <p className="type-small text-ink-soft">
                {[device.ip, formatRelativeDay(isoDay(0, new Date(device.last_seen)))]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            {!device.is_current && (
              <Button
                variant="ghost"
                onClick={() => void signOut(() => signOutDevice(queryClient, device.id))}
              >
                Sign out
              </Button>
            )}
          </li>
        ))}
      </ul>
    </SettingsPart>
  )
}
