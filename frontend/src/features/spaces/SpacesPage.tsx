import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Plus, UsersRound } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { ownership, peopleWord } from './labels'
import { spacesQuery } from './queries'
import { useSpaceForm } from './useSpaceForm'

/** Your spaces as notebook dividers (screen 4a). A person can be in several. */
export function SpacesPage() {
  const spaces = useQuery(spacesQuery)
  const { openNew } = useSpaceForm()
  const items = spaces.data?.items ?? []

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
      <PageHeader
        title="Spaces"
        meta={
          spaces.data &&
          `${items.length} ${items.length === 1 ? 'space' : 'spaces'} · a person can be in several`
        }
        actions={
          <Button variant="secondary" onClick={openNew}>
            <Plus aria-hidden />
            New space
          </Button>
        }
      />

      {spaces.isPending ? (
        <p className="py-10 text-center text-ink-soft">Opening your notebook…</p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((space) => (
            <li key={space.id} data-space={space.color}>
              <Link
                to="/spaces/$spaceId"
                params={{ spaceId: space.id }}
                className="flex h-full flex-col rounded-card border border-line bg-card shadow-paper transition-shadow hover:shadow-float"
              >
                <span className="self-start rounded-t-tab rounded-br-tab bg-space px-3.5 py-1.5 font-medium text-on-space">
                  {space.name}
                </span>
                <span className="flex flex-1 flex-col gap-2 px-4 pt-3 pb-4">
                  <span className="flex items-baseline gap-2">
                    <span className="type-title">{space.people_count}</span>
                    <span className="text-ink-soft">{peopleWord(space.people_count)}</span>
                    {space.member_count > 0 && (
                      <UsersRound aria-label="Shared" className="ml-auto size-4 text-space-ink" />
                    )}
                  </span>
                  {space.description && (
                    <span className="type-small text-ink-soft">{space.description}</span>
                  )}
                  <span className="mt-auto pt-2 type-meta text-ink-faint">{ownership(space)}</span>
                </span>
              </Link>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={openNew}
              className="flex h-full min-h-40 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-card border border-dashed border-line-strong text-ink-soft hover:bg-hover hover:text-ink"
            >
              <span className="flex items-center gap-1.5 font-medium">
                <Plus aria-hidden className="size-4" />
                New space
              </span>
              <span className="type-small text-ink-faint">Private until you share it</span>
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
