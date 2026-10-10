import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { useState, type RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DownloadLink } from '@/components/ui/download-link'
import { MenuRoot } from '@/components/ui/menu-root'
import { menuContentClass, menuItemClass } from '@/components/ui/menu'
import { personCopyUrl } from '@/features/settings/queries'
import { membersQuery, spacesQuery, type Space } from '@/features/spaces/queries'
import { firstNameOf, words } from '@/lib/names'
import { notify, UNDO_FOR, type Notice } from '@/lib/notify'
import { cn } from '@/lib/utils'
import { tearOut } from '@/motion/tearOut'
import { useReducedMotion } from '@/motion/useReducedMotion'
import { countOf } from './labels'
import {
  deletePerson,
  hidePerson,
  familyLinksQuery,
  memoryAidsQuery,
  noteQuery,
  otherLinksQuery,
  refreshPeople,
  restorePerson,
  unhidePerson,
  timelineQuery,
  type PersonDetail,
} from './queries'

type PersonMenuProps = {
  person: PersonDetail
  /** The page that tears out. */
  page: RefObject<HTMLElement | null>
  /** Leave the page once it's torn out (back to People, or close the peek). */
  onGone: () => void
}

/** More actions on a profile: tear your own person out (2r, 2s), or take out a shared one (2t). */
export function PersonMenu({ person, page, onGone }: PersonMenuProps) {
  const queryClient = useQueryClient()
  const reduced = useReducedMotion()
  const [confirming, setConfirming] = useState<'tear' | 'remove' | null>(null)
  const gone = useWhatGoes(person, confirming === 'tear')
  const firstName = firstNameOf(person.name)
  const ownerName = person.owner?.name ?? 'Someone'

  /** Tear the page out while `write` runs; then leave, and offer `undo` for a while. */
  const leave = async (
    write: () => Promise<unknown>,
    done: Omit<Notice, 'action'>,
    undo: () => Promise<unknown>,
  ) => {
    setConfirming(null) // so the page can be seen tearing
    const tearing = page.current && tearOut(page.current, reduced)
    try {
      await Promise.all([write(), tearing?.finished])
    } catch (error) {
      await tearing?.putBack()
      notify({ title: `Couldn't take ${firstName} out`, description: (error as Error).message })
      return
    }
    onGone()
    queryClient.removeQueries({ queryKey: ['people', person.id] })
    void refreshPeople(queryClient)
    notify({
      ...done,
      duration: UNDO_FOR,
      action: {
        label: 'Undo',
        onClick: () =>
          void undo().then(
            () => notify({ title: `${firstName} is back` }),
            (error: Error) => notify({ title: "Couldn't undo that", description: error.message }),
          ),
      },
    })
  }

  return (
    <>
      <MenuRoot>
        <DropdownMenu.Trigger asChild>
          <Button variant="secondary" aria-label="More" className="px-3">
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={6} className={menuContentClass}>
            {person.can_delete && (
              <DropdownMenu.Item
                className={cn(menuItemClass, 'text-danger')}
                onSelect={() => setConfirming('tear')}
              >
                Tear out of the book…
              </DropdownMenu.Item>
            )}
            {person.can_hide && (
              <DropdownMenu.Item className={menuItemClass} onSelect={() => setConfirming('remove')}>
                Remove from my book…
              </DropdownMenu.Item>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </MenuRoot>

      <ConfirmDialog
        open={confirming === 'tear'}
        onOpenChange={(open) => setConfirming(open ? 'tear' : null)}
        title={`Tear ${firstName} out of the book?`}
        description={`You'll have ten seconds to undo. After that, ${firstName} is deleted from your FolkBook.`}
        cancelLabel="Keep"
        confirmLabel="Tear out"
        onConfirm={() =>
          void leave(
            () => deletePerson(person.id),
            { title: `${person.name} torn out`, description: gone.summary },
            () => restorePerson(queryClient, person.id),
          )
        }
      >
        {gone.lines.length > 0 && <Details lines={gone.lines} />}
        {gone.shared.map((space) => (
          <SharedSpaceNote key={space.id} space={space} firstName={firstName} />
        ))}
        <DownloadLink href={personCopyUrl(person.id)} variant="secondary" className="mt-3">
          Download a copy first
        </DownloadLink>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirming === 'remove'}
        onOpenChange={(open) => setConfirming(open ? 'remove' : null)}
        title={`${firstName} isn't yours to delete`}
        description={`${ownerName} shared ${firstName} with you. You can take ${firstName} out of your book: ${firstName} is hidden everywhere for you, and ${firstNameOf(ownerName)} keeps ${firstName}.`}
        cancelLabel="Keep"
        confirmLabel="Remove from my book"
        onConfirm={() =>
          void leave(
            () => hidePerson(person.id),
            { title: `${person.name} removed from your book` },
            () => unhidePerson(queryClient, person.id),
          )
        }
      >
        <Details
          lines={[
            `Your notes, memory aids and timeline about ${firstName} are kept, out of sight`,
            `Connections you drew to ${firstName} are hidden too`,
            ...(person.spaces.length > 0
              ? [
                  `You can add ${firstName} back from ${words(person.spaces.map((space) => space.name))}`,
                ]
              : []),
          ]}
        />
      </ConfirmDialog>
    </>
  )
}

function Details({ lines }: { lines: string[] }) {
  return (
    <ul className="mt-4 flex flex-col gap-1.5 rounded-card border border-line bg-card px-4 py-3 type-small">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  )
}

/** "Deniz is in Friends, a shared space. Bora Kaya will no longer see Deniz there." */
function SharedSpaceNote({ space, firstName }: { space: Space; firstName: string }) {
  const members = useQuery(membersQuery(space.id)).data
  const who = members
    ? names(members.filter((member) => !member.is_you).map((member) => member.name))
    : others(space)
  return (
    <p className="mt-3 rounded-card bg-hover px-4 py-3 type-small">
      <strong className="font-medium">
        {firstName} is in {space.name}, a shared space.
      </strong>{' '}
      {who} will no longer see {firstName} there. Their own notes about {firstName} are theirs and
      stay put.
    </p>
  )
}

/** "Bora Kaya", "Bora Kaya and Defne Aydın", "A, B, C and 2 others". */
function names(all: string[]): string {
  const shown = all.length > 4 ? all.slice(0, 3) : all
  return words([...shown, all.length > shown.length && countOf(all.length - 3, 'other')])
}

/** "Defne and 3 others", "2 others": everyone in the space but you, until their names load. */
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
