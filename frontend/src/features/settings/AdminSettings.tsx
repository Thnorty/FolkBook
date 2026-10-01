import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { MoreHorizontal } from 'lucide-react'
import { DropdownMenu, Dialog } from 'radix-ui'
import { useState, type FormEvent } from 'react'
import { currentUserQuery } from '@/api/session'
import { Button } from '@/components/ui/button'
import { Choice } from '@/components/ui/choice'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CopyLink } from '@/components/ui/copy-link'
import { labelClass } from '@/components/ui/label'
import { menuContentClass, menuItemClass } from '@/components/ui/menu'
import { createInvite } from '@/features/invites/queries'
import { appLink } from '@/lib/links'
import { spacesQuery } from '@/features/spaces/queries'
import { formatDay, formatRelativeDay, isoDay } from '@/lib/dates'
import { notify } from '@/lib/notify'
import { cn } from '@/lib/utils'
import {
  createResetLink,
  invitesQuery,
  revokeInvite,
  updateUser,
  usersQuery,
  type Invite,
  type User,
} from './queries'
import { SettingsPage, SettingsPart } from './SettingsPage'

const relative = (moment: string) => formatRelativeDay(isoDay(0, new Date(moment)))

/** Everyone on this server, and what an admin can do for them (screen 5u). */
export function UsersSettings() {
  const users = useQuery(usersQuery)
  const myId = useQuery(currentUserQuery).data?.id
  const reset = useMutation({ mutationFn: (user: User) => createResetLink(user.id) })

  return (
    <SettingsPage title="Users">
      <SettingsPart
        title="Users on this server"
        note="Everyone here has their own private book. They only see what's shared with them."
        action={
          <Button asChild variant="secondary">
            <Link to="/settings/invites">Invite people</Link>
          </Button>
        }
      >
        {users.error && <p className="type-small text-danger">{users.error.message}</p>}
        <ul className="flex flex-col divide-y divide-line">
          {(users.data ?? []).map((user) => (
            <li key={user.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className={cn(!user.is_active && 'text-ink-faint')}>
                  {user.name}
                  {user.id === myId && <span className="text-ink-faint"> (you)</span>}
                </p>
                <p className="truncate type-small text-ink-soft">
                  {[
                    user.email,
                    user.is_admin ? 'Admin' : 'Member',
                    user.is_active ? null : 'Deactivated',
                    user.last_active && `active ${relative(user.last_active)}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              {user.id !== myId && <UserMenu user={user} onReset={() => reset.mutate(user)} />}
            </li>
          ))}
        </ul>
      </SettingsPart>
      {reset.variables && (
        <ResetLinkDialog
          user={reset.variables}
          link={reset.data}
          error={reset.error?.message}
          onClose={() => reset.reset()}
        />
      )}
    </SettingsPage>
  )
}

function UserMenu({ user, onReset }: { user: User; onReset: () => void }) {
  const queryClient = useQueryClient()
  const [deactivating, setDeactivating] = useState(false)
  const firstName = user.name.split(' ')[0]
  const change = (changes: Parameters<typeof updateUser>[2], done: string) =>
    updateUser(queryClient, user.id, changes).then(
      () => notify({ title: done }),
      (error: Error) => notify({ title: "Couldn't change that", description: error.message }),
    )

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="ghost" aria-label={`${user.name}: manage`} className="w-9 px-0">
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={4} className={menuContentClass}>
            <DropdownMenu.Item className={menuItemClass} onSelect={onReset}>
              Make a password reset link
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={menuItemClass}
              onSelect={() =>
                void change(
                  { is_admin: !user.is_admin },
                  user.is_admin ? `${firstName} is a member now` : `${firstName} is an admin now`,
                )
              }
            >
              {user.is_admin ? 'Remove admin rights' : 'Make admin'}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={cn(menuItemClass, user.is_active && 'text-danger')}
              onSelect={() =>
                user.is_active
                  ? setDeactivating(true)
                  : void change({ is_active: true }, `${firstName} can log in again`)
              }
            >
              {user.is_active ? 'Deactivate account…' : 'Reactivate account'}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <ConfirmDialog
        open={deactivating}
        onOpenChange={setDeactivating}
        title={`Deactivate ${user.name}?`}
        description={`${firstName} is signed out everywhere and can't log in. Their book is kept and comes back if you reactivate them.`}
        confirmLabel="Deactivate"
        onConfirm={() => {
          setDeactivating(false)
          void change({ is_active: false }, `${firstName} is deactivated`)
        }}
      />
    </>
  )
}

/** Without email, a reset link is made here and passed on by the admin. */
function ResetLinkDialog({
  user,
  link,
  error,
  onClose,
}: {
  user: User
  link?: Awaited<ReturnType<typeof createResetLink>>
  error?: string
  onClose: () => void
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/25" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 z-40 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card border border-line bg-paper p-5 shadow-float"
        >
          <Dialog.Title className="type-title">Reset link for {user.name}</Dialog.Title>
          {!link && !error && <p className="mt-3 text-ink-soft">Making the link…</p>}
          {error && <p className="mt-3 text-danger">{error}</p>}
          {link && (
            <>
              <p className="mt-2 text-ink-soft">
                Email isn&apos;t set up here, so pass this on to {link.email} yourself. It works
                once, until {formatDay(link.expires_at.slice(0, 10))}, and replaces any older link.
              </p>
              <div className="mt-4">
                <CopyLink link={appLink(link.path)} label="Reset link" />
              </div>
            </>
          )}
          <div className="mt-5 flex justify-end">
            <Dialog.Close asChild>
              <Button variant="ghost">Done</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

const EXPIRES = [1, 7, 30]
const USES = [
  { value: 1, label: '1 person' },
  { value: 10, label: 'Up to 10' },
]

/** Invite links: make one, copy it, revoke it (screen 5v). */
export function InvitesSettings() {
  const queryClient = useQueryClient()
  const invites = useQuery(invitesQuery).data ?? []
  const ownSpaces = (useQuery(spacesQuery).data?.items ?? []).filter(
    (space) => space.role === 'owner',
  )
  const [expires, setExpires] = useState(7)
  const [uses, setUses] = useState(1)
  const create = useMutation({
    mutationFn: (spaceId: string) =>
      createInvite({ expires_in_days: expires, max_uses: uses, space_id: spaceId || null }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invitesQuery.queryKey }),
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    create.mutate(String(new FormData(event.currentTarget).get('space') ?? ''))
  }

  return (
    <SettingsPage title="Invite links">
      <SettingsPart
        title="New link"
        note="Anyone with a link can create an account here until it expires or runs out of uses."
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <fieldset>
            <legend className={labelClass}>Expires in</legend>
            <div className="flex gap-1.5">
              {EXPIRES.map((days) => (
                <Choice
                  key={days}
                  name="expires"
                  look="box"
                  checked={expires === days}
                  onChange={() => setExpires(days)}
                >
                  {days === 1 ? '1 day' : `${days} days`}
                </Choice>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className={labelClass}>Uses</legend>
            <div className="flex gap-1.5">
              {USES.map((option) => (
                <Choice
                  key={option.value}
                  name="uses"
                  look="box"
                  checked={uses === option.value}
                  onChange={() => setUses(option.value)}
                >
                  {option.label}
                </Choice>
              ))}
            </div>
          </fieldset>
          {ownSpaces.length > 0 && (
            <div className="max-w-xs">
              <label htmlFor="invite-space" className={labelClass}>
                Also share a space
              </label>
              <select
                id="invite-space"
                name="space"
                className="h-11 w-full rounded-card border border-line-input bg-card px-3 text-input outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-focus-glow md:h-10"
              >
                <option value="">No space</option>
                {ownSpaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name} (as a viewer)
                  </option>
                ))}
              </select>
            </div>
          )}
          {create.error && <p className="type-small text-danger">{create.error.message}</p>}
          <Button type="submit" className="self-start" disabled={create.isPending}>
            Create link
          </Button>
        </form>
      </SettingsPart>
      {invites.length > 0 && (
        <SettingsPart title="Links">
          <ul className="flex flex-col divide-y divide-line">
            {invites.map((invite) => (
              <InviteRow key={invite.id} invite={invite} />
            ))}
          </ul>
        </SettingsPart>
      )}
    </SettingsPage>
  )
}

function InviteRow({ invite }: { invite: Invite }) {
  const queryClient = useQueryClient()
  const revoke = () =>
    revokeInvite(queryClient, invite.id).catch((error: Error) =>
      notify({ title: "Couldn't revoke it", description: error.message }),
    )
  const details = [
    invite.is_usable ? `expires ${relative(invite.expires_at)}` : 'no longer works',
    `used ${invite.uses} / ${invite.max_uses}`,
    invite.space && `shares ${invite.space.name}`,
    invite.created_by && `by ${invite.created_by.name}`,
  ].filter(Boolean)

  return (
    <li className="flex flex-col gap-2 py-3">
      {invite.is_usable && <CopyLink link={appLink(invite.path)} label="Invite link" />}
      <div className="flex items-center gap-2">
        <p className="flex-1 type-small text-ink-soft">{details.join(' · ')}</p>
        <Button variant="ghost" onClick={() => void revoke()}>
          {invite.is_usable ? 'Revoke' : 'Delete'}
        </Button>
      </div>
    </li>
  )
}
