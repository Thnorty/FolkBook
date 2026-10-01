import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useDeferredValue, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { FormDialog, FormDialogFooter } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { labelClass } from '@/components/ui/label'
import { notify } from '@/lib/notify'
import { peopleCount } from './labels'
import {
  changeRole,
  membersQuery,
  refreshSpaces,
  shareCandidatesQuery,
  shareSpace,
  updateSpace,
  type Role,
  type Space,
} from './queries'

const FORM_ID = 'share-space'
const SELECT =
  'h-11 rounded-card border border-line-input bg-card px-2.5 text-input outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-focus-glow md:h-9'

type Pending = { userId: string; name: string; email: string; role: Role }

/** Share a space with accounts on this server, and choose what they see (screens 4h, 4i). */
export function ShareDialog({ space, onClose }: { space: Space; onClose: () => void }) {
  const queryClient = useQueryClient()
  const members = (useQuery(membersQuery(space.id)).data ?? []).filter(
    (member) => member.role !== 'owner',
  )
  const [contacts, setContacts] = useState(space.share_contact_details)
  const [pending, setPending] = useState<Pending[]>([])
  const firstTime = space.member_count === 0

  const save = useMutation({
    mutationFn: async () => {
      if (contacts !== space.share_contact_details) {
        await updateSpace(space.id, { share_contact_details: contacts })
      }
      for (const person of pending) await shareSpace(space.id, person.userId, person.role)
    },
    onSuccess: async () => {
      await refreshSpaces(queryClient)
      onClose()
      if (pending.length > 0) {
        notify({ title: `${space.name} shared with ${peopleCount(pending.length)}` })
      }
    },
  })
  const role = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      changeRole(space.id, userId, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membersQuery(space.id).queryKey }),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate()
  }

  return (
    <FormDialog
      title={`Share ${space.name}`}
      formId={FORM_ID}
      submitLabel={pending.length > 0 ? 'Share' : 'Save'}
      busy={save.isPending}
      onClose={onClose}
    >
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-5">
        {firstTime && (
          <p className="rounded-card bg-hover px-4 py-3 type-small">
            <span className="block type-label text-ink-faint">First time sharing this space</span>
            Members will see these {peopleCount(space.people_count)}&apos;s basic profiles and this
            space&apos;s links. Your notes and memory aids stay private.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-card border border-line p-3">
            <h3 className={labelClass}>They see</h3>
            <p className="type-small text-ink-soft">
              Name, photo, birthday, tags, and who&apos;s linked to whom in this space
              {contacts && ', and phone numbers and emails'}
            </p>
          </div>
          <div className="rounded-card border border-line p-3">
            <h3 className={labelClass}>Only you see</h3>
            <p className="type-small text-ink-soft">
              Your notes, memory aids, timeline, and your other spaces
            </p>
          </div>
        </div>
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={contacts}
            onChange={(event) => setContacts(event.target.checked)}
            className="mt-1 size-4 accent-accent"
          />
          <span>
            Also share contact details (phone, email)
            <span className="block type-small text-ink-faint">
              Off by default. Only turn it on if every member should be able to reach these people.
            </span>
          </span>
        </label>

        <AccountSearch
          spaceId={space.id}
          exclude={pending.map((person) => person.userId)}
          onAdd={(person) => setPending([...pending, { ...person, role: 'viewer' }])}
        />

        {(pending.length > 0 || members.length > 0) && (
          <div>
            <h3 className={labelClass}>Members</h3>
            <ul className="flex flex-col divide-y divide-line">
              {pending.map((person) => (
                <MemberRow
                  key={person.userId}
                  name={person.name}
                  email={person.email}
                  role={person.role}
                  note="to add"
                  onRole={(next) =>
                    setPending(
                      pending.map((other) =>
                        other.userId === person.userId ? { ...other, role: next } : other,
                      ),
                    )
                  }
                  onRemove={() =>
                    setPending(pending.filter((other) => other.userId !== person.userId))
                  }
                />
              ))}
              {members.map((member) => (
                <MemberRow
                  key={member.user_id}
                  name={member.name}
                  email={member.email}
                  role={member.role as Role}
                  onRole={(next) => role.mutate({ userId: member.user_id, role: next })}
                />
              ))}
            </ul>
            <p className="mt-2 type-small text-ink-faint">
              Viewers can look. Editors can also add people and fix basic details.
            </p>
          </div>
        )}

        {(save.error ?? role.error) && (
          <p role="alert" className="type-small text-danger">
            {(save.error ?? role.error)?.message}
          </p>
        )}
        <FormDialogFooter
          submitLabel={pending.length > 0 ? `Share with ${peopleCount(pending.length)}` : 'Save'}
          busy={save.isPending}
          onCancel={onClose}
          hint={
            <>
              Only accounts on this server · <Kbd shortcut={{ key: 'Enter', mod: true }} /> saves
            </>
          }
        />
      </form>
    </FormDialog>
  )
}

function AccountSearch({
  spaceId,
  exclude,
  onAdd,
}: {
  spaceId: string
  exclude: string[]
  onAdd: (person: Omit<Pending, 'role'>) => void
}) {
  const [text, setText] = useState('')
  const q = useDeferredValue(text.trim())
  const found = (useQuery(shareCandidatesQuery(spaceId, q)).data ?? []).filter(
    (account) => !exclude.includes(account.user_id),
  )

  return (
    <div>
      <label htmlFor="share-search" className={labelClass}>
        Add people on this server
      </label>
      <Input
        id="share-search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Name or email"
        autoComplete="off"
      />
      {q.length >= 2 && (
        <ul aria-label="Accounts" className="mt-1.5 flex flex-col">
          {found.length === 0 && (
            <li className="px-2 py-2 type-small text-ink-faint">No one else here matches.</li>
          )}
          {found.map((account) => (
            <li key={account.user_id} className="flex items-center gap-3 px-2 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block">{account.name}</span>
                <span className="block truncate type-small text-ink-faint">{account.email}</span>
              </span>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  onAdd({ userId: account.user_id, name: account.name, email: account.email })
                  setText('')
                }}
              >
                Add
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function MemberRow({
  name,
  email,
  role,
  note,
  onRole,
  onRemove,
}: {
  name: string
  email: string
  role: Role
  note?: string
  onRole: (role: Role) => void
  onRemove?: () => void
}) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block">
          {name}
          {note && <span className="ml-2 type-meta text-accent">{note}</span>}
        </span>
        <span className="block truncate type-small text-ink-faint">{email}</span>
      </span>
      <select
        aria-label={`${name}'s role`}
        value={role}
        onChange={(event) => onRole(event.target.value as Role)}
        className={SELECT}
      >
        <option value="viewer">Viewer</option>
        <option value="editor">Editor</option>
      </select>
      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          aria-label={`Don't add ${name}`}
          className="w-9 px-0"
          onClick={onRemove}
        >
          <X aria-hidden />
        </Button>
      )}
    </li>
  )
}
