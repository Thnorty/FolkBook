import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { MoreHorizontal, UsersRound } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { lazy, Suspense, useCallback, useState } from 'react'
import { ApiError } from '@/api/errors'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { MenuRoot } from '@/components/ui/menu-root'
import { menuContentClass, menuItemClass, menuSeparatorClass } from '@/components/ui/menu'
import { NoMatch, PeopleResults } from '@/features/people/PeopleResults'
import { SearchBox } from '@/features/people/SearchBox'
import { unhidePerson } from '@/features/person/queries'
import { notify } from '@/lib/notify'
import { usePageTitle } from '@/lib/usePageTitle'
import { cn } from '@/lib/utils'
import { useClosing } from '@/motion/useClosing'
import { ownership, peopleCount } from './labels'
import { LeaveDialog } from './LeaveDialog'
import {
  changeRole,
  deleteSpace,
  hiddenPeopleQuery,
  membersQuery,
  refreshSpaces,
  removeMember,
  spaceQuery,
  stopSharing,
  type Member,
  type Role,
  type Space,
} from './queries'
import { ShareDialog } from './ShareDialog'
import { useSpaceForm } from './useSpaceForm'

// The graph code (WebGL) loads only when a space has people to draw.
const SpaceGraph = lazy(() => import('@/features/graph/SpaceGraph'))

/** One space: what it is, and its people (screens 4b, 4e). */
export function SpacePage() {
  const { spaceId } = useParams({ from: '/app/spaces/$spaceId' })
  const space = useQuery(spaceQuery(spaceId))
  const [search, setSearch] = useState('')
  const [sharing, setSharing] = useState(false)
  const [shareShown, shareClosing] = useClosing(sharing || null)
  const clear = useCallback(() => setSearch(''), [])
  usePageTitle(space.data?.name ?? 'Space')

  if (space.isPending) {
    return <p className="py-16 text-center text-ink-soft">Opening the space…</p>
  }
  if (space.isError) {
    const missing = space.error instanceof ApiError && space.error.status === 404
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="type-title">
          {missing ? 'Not one of your spaces' : 'Something went wrong'}
        </h1>
        <p className="mt-2 text-ink-soft">
          {missing ? "This space doesn't exist, or isn't shared with you." : space.error.message}
        </p>
      </div>
    )
  }

  const data = space.data
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
      <p className="mb-5 type-meta text-ink-faint">
        <Link to="/spaces" className="hover:text-ink">
          Spaces
        </Link>{' '}
        / {data.name}
      </p>

      <header
        data-space={data.color}
        className="flex flex-wrap items-start gap-4 border-b-2 border-space pb-5"
      >
        <div className="min-w-0 flex-1">
          <h1 className="type-display">{data.name}</h1>
          {data.description && <p className="mt-2 max-w-prose text-ink-soft">{data.description}</p>}
          <p className="mt-2 flex flex-wrap items-center gap-x-2 type-meta text-ink-faint">
            {peopleCount(data.people_count)} · {ownership(data)}
            {data.member_count > 0 && (
              <span className="flex items-center gap-1 normal-case">
                <UsersRound aria-hidden className="size-3.5" />
                Shared with {data.member_count}
              </span>
            )}
          </p>
        </div>
        {data.role === 'owner' ? (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setSharing(true)}>
              <UsersRound aria-hidden />
              Share
            </Button>
            <SpaceMenu space={data} />
          </div>
        ) : (
          <MemberMenu space={data} />
        )}
      </header>

      <div className="mt-5 flex flex-col gap-4">
        {data.people_count > 0 && (
          <SearchBox
            value={search}
            onSearch={setSearch}
            label={`Search ${peopleCount(data.people_count)}`}
          />
        )}
        <PeopleResults
          filters={{ space: spaceId, search }}
          empty={
            search ? (
              <NoMatch onClear={clear} />
            ) : (
              <p className="py-10 text-center text-ink-soft">
                No one here yet. Add people from their profile: Edit, then pick this space.
              </p>
            )
          }
        />
        <HiddenPeople spaceId={spaceId} />
        {data.member_count > 0 && <Members space={data} />}
        {data.people_count > 0 && (
          <Suspense fallback={null}>
            <SpaceGraph spaceId={spaceId} />
          </Suspense>
        )}
        <Link to="/graph" className="self-start text-md font-medium text-accent hover:underline">
          Open the graph →
        </Link>
      </div>
      {shareShown && (
        <ShareDialog space={data} open={!shareClosing} onClose={() => setSharing(false)} />
      )}
    </div>
  )
}

/** Who can see this space, and as what. The owner can change roles or remove people (5c). */
function Members({ space }: { space: Space }) {
  const members = useQuery(membersQuery(space.id)).data ?? []
  const owner = space.role === 'owner'
  return (
    <section aria-labelledby="space-members" className="flex flex-col gap-2">
      <h2 id="space-members" className="type-label text-ink-faint">
        Who sees this space
      </h2>
      <ul
        className={owner ? 'flex flex-col divide-y divide-line' : 'flex flex-wrap gap-x-4 gap-y-1'}
      >
        {members.map((member) => (
          <li key={member.user_id} className={cn(owner && 'flex items-center gap-2 py-1.5')}>
            <span>
              {member.name}
              {member.is_you && ' (you)'}
              <span className="ml-1.5 type-meta text-ink-faint">{member.role}</span>
            </span>
            {owner && member.role !== 'owner' && <MemberRowMenu space={space} member={member} />}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Make editor or viewer, or remove from the space (screens 5c, 5d). */
function MemberRowMenu({ space, member }: { space: Space; member: Member }) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const first = member.name.split(' ')[0]
  const other: Role = member.role === 'editor' ? 'viewer' : 'editor'
  const role = useMutation({
    mutationFn: () => changeRole(space.id, member.user_id, other),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membersQuery(space.id).queryKey }),
    onError: (error) => notify({ title: error.message }),
  })
  const remove = useMutation({
    mutationFn: () => removeMember(space.id, member.user_id),
    onSuccess: async () => {
      setConfirming(false)
      await refreshSpaces(queryClient)
      notify({ title: `${first} no longer sees ${space.name}` })
    },
    onError: (error) => notify({ title: error.message }),
  })

  return (
    <>
      <MenuRoot>
        <DropdownMenu.Trigger asChild>
          <Button
            variant="ghost"
            className="ml-auto w-9 px-0"
            aria-label={`${member.name}: actions`}
          >
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={6} className={menuContentClass}>
            <DropdownMenu.Item className={menuItemClass} onSelect={() => role.mutate()}>
              Make {other}
            </DropdownMenu.Item>
            <DropdownMenu.Separator className={menuSeparatorClass} />
            <DropdownMenu.Item
              className={cn(menuItemClass, 'text-danger')}
              onSelect={() => setConfirming(true)}
            >
              Remove from {space.name}…
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </MenuRoot>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Remove ${first} from ${space.name}?`}
        description={`${first} stops seeing this space today. Anyone ${first} wrote notes on stays in ${first}'s book as a kept copy — you won't see who.`}
        confirmLabel={`Remove ${first}`}
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  )
}

/** Leave a space shared with you (screens 5a, 5b). */
function MemberMenu({ space }: { space: Space }) {
  const [leaving, setLeaving] = useState(false)
  return (
    <>
      <MenuRoot>
        <DropdownMenu.Trigger asChild>
          <Button variant="secondary" aria-label="Space actions">
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={6} className={menuContentClass}>
            <DropdownMenu.Item
              className={cn(menuItemClass, 'text-danger')}
              onSelect={() => setLeaving(true)}
            >
              Leave space…
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </MenuRoot>
      {leaving && <LeaveDialog space={space} onClose={() => setLeaving(false)} />}
    </>
  )
}

/** People here you took out of your book (screen 2t: "add them back from the space"). */
function HiddenPeople({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient()
  const hidden = useQuery(hiddenPeopleQuery(spaceId)).data ?? []
  const addBack = useMutation({
    mutationFn: (personId: string) => unhidePerson(queryClient, personId),
    onSuccess: (person) => notify({ title: `${person.name} is back in your book` }),
    onError: (error) => notify({ title: "Couldn't add them back", description: error.message }),
  })
  if (hidden.length === 0) return null

  return (
    <section
      aria-labelledby="hidden-people"
      className="rounded-card border border-dashed border-line-strong p-3"
    >
      <h2 id="hidden-people" className="px-1 type-meta text-ink-faint">
        Taken out of your book · {hidden.length}
      </h2>
      <ul className="mt-1 flex flex-col">
        {hidden.map((person) => (
          <li key={person.id} className="flex items-center gap-3 px-1 py-1">
            <span className="font-serif text-lg text-ink-soft">{person.name}</span>
            <Button
              variant="ghost"
              className="ml-auto"
              disabled={addBack.isPending}
              onClick={() => addBack.mutate(person.id)}
            >
              Add back
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Edit, Stop sharing and Delete, for the owner. */
function SpaceMenu({ space }: { space: Space }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { openEdit } = useSpaceForm()
  const [confirming, setConfirming] = useState<'delete' | 'unshare' | null>(null)
  const remove = useMutation({
    mutationFn: () => deleteSpace(space.id),
    onSuccess: async () => {
      setConfirming(null)
      await navigate({ to: '/spaces' })
      await refreshSpaces(queryClient)
      notify({
        title: `${space.name} deleted`,
        description: 'Its people are still in your notebook.',
      })
    },
    onError: (error) => notify({ title: error.message }),
  })
  const unshare = useMutation({
    mutationFn: () => stopSharing(space.id),
    onSuccess: async () => {
      setConfirming(null)
      await refreshSpaces(queryClient)
      notify({ title: `${space.name} is private again` })
    },
    onError: (error) => notify({ title: error.message }),
  })
  const members = space.member_count

  return (
    <>
      <MenuRoot>
        <DropdownMenu.Trigger asChild>
          <Button variant="secondary" aria-label="Space actions">
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={6} className={menuContentClass}>
            <DropdownMenu.Item className={menuItemClass} onSelect={() => openEdit(space.id)}>
              Edit space
            </DropdownMenu.Item>
            <DropdownMenu.Separator className={menuSeparatorClass} />
            {members > 0 && (
              <DropdownMenu.Item
                className={cn(menuItemClass, 'text-danger')}
                onSelect={() => setConfirming('unshare')}
              >
                Stop sharing…
              </DropdownMenu.Item>
            )}
            <DropdownMenu.Item
              className={cn(menuItemClass, 'text-danger')}
              onSelect={() => setConfirming('delete')}
            >
              Delete space…
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </MenuRoot>
      <ConfirmDialog
        open={confirming === 'delete'}
        onOpenChange={(open) => setConfirming(open ? 'delete' : null)}
        title={`Delete ${space.name}?`}
        description="Its people and links stay in your notebook; only the space goes. Anyone it's shared with loses it too, keeping copies of anyone they wrote notes on."
        confirmLabel="Delete space"
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
      <ConfirmDialog
        open={confirming === 'unshare'}
        onOpenChange={(open) => setConfirming(open ? 'unshare' : null)}
        title={`Stop sharing ${space.name}?`}
        description={`${members === 1 ? 'Its member stops' : `All ${members} members stop`} seeing it today. They keep copies of anyone they wrote notes on — you won't see who. The space and its people stay yours.`}
        confirmLabel="Stop sharing"
        busy={unshare.isPending}
        onConfirm={() => unshare.mutate()}
      />
    </>
  )
}
