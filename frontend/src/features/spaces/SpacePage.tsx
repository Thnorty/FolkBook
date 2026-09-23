import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { MoreHorizontal, UsersRound } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { useCallback, useState } from 'react'
import { ApiError } from '@/api/errors'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { menuContentClass, menuItemClass, menuSeparatorClass } from '@/components/ui/menu'
import { NoMatch, PeopleResults } from '@/features/people/PeopleResults'
import { SearchBox } from '@/features/people/SearchBox'
import { notify } from '@/lib/notify'
import { usePageTitle } from '@/lib/usePageTitle'
import { cn } from '@/lib/utils'
import { ownership, peopleCount } from './labels'
import { deleteSpace, refreshSpaces, spaceQuery, type Space } from './queries'
import { useSpaceForm } from './useSpaceForm'

/** One space: what it is, and its people (screens 4b, 4e). */
export function SpacePage() {
  const { spaceId } = useParams({ from: '/app/spaces/$spaceId' })
  const space = useQuery(spaceQuery(spaceId))
  const [search, setSearch] = useState('')
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
        {data.role === 'owner' && <SpaceMenu space={data} />}
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
        <Link to="/graph" className="self-start text-md font-medium text-accent hover:underline">
          Open the graph →
        </Link>
      </div>
    </div>
  )
}

/** Edit and Delete, for the owner. Sharing comes with #29. */
function SpaceMenu({ space }: { space: Space }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { openEdit } = useSpaceForm()
  const [confirming, setConfirming] = useState(false)
  const remove = useMutation({
    mutationFn: () => deleteSpace(space.id),
    onSuccess: async () => {
      setConfirming(false)
      await navigate({ to: '/spaces' })
      await refreshSpaces(queryClient)
      notify({
        title: `${space.name} deleted`,
        description: 'Its people are still in your notebook.',
      })
    },
    onError: (error) => notify({ title: error.message }),
  })

  return (
    <>
      <DropdownMenu.Root>
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
            <DropdownMenu.Item
              className={cn(menuItemClass, 'text-danger')}
              onSelect={() => setConfirming(true)}
            >
              Delete space…
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${space.name}?`}
        description="Its people and links stay in your notebook; only the space goes. Anyone it's shared with loses it too."
        confirmLabel="Delete space"
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  )
}
