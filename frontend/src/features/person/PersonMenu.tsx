import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { useState, type RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { menuContentClass, menuItemClass } from '@/components/ui/menu'
import { spacesQuery, type Space } from '@/features/spaces/queries'
import { notify } from '@/lib/notify'
import { cn } from '@/lib/utils'
import { tearOut } from '@/motion/tearOut'
import { useReducedMotion } from '@/motion/useReducedMotion'
import { countOf } from './labels'
import {
  deletePerson,
  familyLinksQuery,
  memoryAidsQuery,
  noteQuery,
  otherLinksQuery,
  refreshPeople,
  restorePerson,
  timelineQuery,
  type PersonDetail,
} from './queries'

const UNDO_FOR = 10_000 // the server keeps them a little longer, for slow connections

type PersonMenuProps = {
  person: PersonDetail
  /** The page that tears out. */
  page: RefObject<HTMLElement | null>
  /** Leave the page once it's torn out (back to People, or close the peek). */
  onGone: () => void
}

/** More actions on a profile: for now, tearing the person out of the book (2r, 2s). */
export function PersonMenu({ person, page, onGone }: PersonMenuProps) {
  const queryClient = useQueryClient()
  const reduced = useReducedMotion()
  const [confirming, setConfirming] = useState(false)
  const gone = useWhatGoes(person, confirming)
  const firstName = person.name.split(' ')[0]

  const tear = async () => {
    setConfirming(false) // so the page can be seen tearing
    const tearing = page.current && tearOut(page.current, reduced)
    try {
      await Promise.all([deletePerson(person.id), tearing?.finished])
    } catch (error) {
      await tearing?.putBack()
      notify({ title: `Couldn't tear ${firstName} out`, description: (error as Error).message })
      return
    }
    onGone()
    queryClient.removeQueries({ queryKey: ['people', person.id] })
    void refreshPeople(queryClient)
    notify({
      title: `${person.name} torn out`,
      description: gone.summary,
      duration: UNDO_FOR,
      action: {
        label: 'Undo',
        onClick: () =>
          void restorePerson(queryClient, person.id).then(
            () => notify({ title: `${firstName} is back` }),
            (error: Error) => notify({ title: "Couldn't undo that", description: error.message }),
          ),
      },
    })
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="secondary" aria-label="More" className="px-3">
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={6} className={menuContentClass}>
            <DropdownMenu.Item
              className={cn(menuItemClass, 'text-danger')}
              onSelect={() => setConfirming(true)}
            >
              Tear out of the book…
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Tear ${firstName} out of the book?`}
        description={`You'll have ten seconds to undo. After that, ${firstName} is deleted from your FolkBook.`}
        cancelLabel="Keep"
        confirmLabel="Tear out"
        onConfirm={() => void tear()}
      >
        {gone.lines.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1.5 rounded-card border border-line bg-card px-4 py-3 type-small">
            {gone.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {gone.shared.map((space) => (
          <p key={space.id} className="mt-3 rounded-card bg-hover px-4 py-3 type-small">
            <strong className="font-medium">
              {firstName} is in {space.name}, a shared space.
            </strong>{' '}
            {others(space)} will no longer see {firstName} there, and their own notes about{' '}
            {firstName} are deleted too.
          </p>
        ))}
      </ConfirmDialog>
    </>
  )
}

/** "Defne and 3 others", "2 others": everyone in the space but you. */
function others(space: Space): string {
  if (space.role === 'owner') return countOf(space.member_count, 'other member')
  const owner = space.owner?.name ?? 'The owner'
  const rest = space.member_count - 1 // the members, less you
  return rest > 0 ? `${owner} and ${countOf(rest, 'other')}` : owner
}

/** What goes with someone when they're torn out, from what their page already loaded. */
function useWhatGoes(person: PersonDetail, open: boolean) {
  const options = { enabled: open }
  const family = useQuery({ ...familyLinksQuery(person.id), ...options }).data ?? []
  const other = useQuery({ ...otherLinksQuery(person.id), ...options }).data ?? []
  const aids = useQuery({ ...memoryAidsQuery(person.id), ...options }).data ?? []
  const timeline = useQuery({ ...timelineQuery(person.id), ...options }).data?.count ?? 0
  const note = useQuery({ ...noteQuery(person.id), ...options }).data?.body
  const spaces = useQuery({ ...spacesQuery, ...options }).data?.items ?? []

  const links = [...family, ...other]
  const names = links.map(
    (link) => (link.person_a.id === person.id ? link.person_b : link.person_a).name,
  )
  const yours = words([
    aids.length > 0 && countOf(aids.length, 'memory aid'),
    timeline > 0 && countOf(timeline, 'timeline entry', 'timeline entries'),
    Boolean(note) && 'your note',
  ])
  const went = words([
    links.length > 0 && countOf(links.length, 'connection'),
    aids.length > 0 && countOf(aids.length, 'memory aid'),
  ])
  const inSpaces = spaces.filter((space) => person.spaces.some((ref) => ref.id === space.id))

  return {
    shared: inSpaces.filter((space) => space.member_count > 0),
    lines: [
      links.length > 0 && `${countOf(links.length, 'connection')}: ${names.join(', ')}`,
      yours,
      ...inSpaces.map((space) => `Leaves the ${space.name} space`),
    ].filter((line): line is string => Boolean(line)),
    summary: went ? `${went} went with them.` : undefined,
  }
}

/** "a", "a and b", "a, b and c"; nothing for none. */
function words(parts: (string | false)[]): string {
  const kept = parts.filter((part): part is string => Boolean(part))
  return kept.length > 1 ? `${kept.slice(0, -1).join(', ')} and ${kept.at(-1)}` : (kept[0] ?? '')
}
