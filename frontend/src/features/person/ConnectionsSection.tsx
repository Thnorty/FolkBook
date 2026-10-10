import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { MoreHorizontal, Plus } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { MenuRoot } from '@/components/ui/menu-root'
import { menuContentClass, menuItemClass, menuSeparatorClass } from '@/components/ui/menu'
import { notify } from '@/lib/notify'
import { cn } from '@/lib/utils'
import { useClosing } from '@/motion/useClosing'
import { EndConnectionDialog } from './EndConnectionDialog'
import { linkLabel, relationLabel } from './labels'
import { ProfileSection } from './ProfileSection'
import {
  createRelationship,
  deleteRelationship,
  endRelationship,
  familyLinksQuery,
  familyQuery,
  otherLinksQuery,
  personQuery,
  reopenRelationship,
  type FamilyRelation,
  type Relationship,
} from './queries'
import { useConnectionForm } from './useConnectionForm'

type Row = {
  key: string
  group: 'family' | 'other'
  personId: string
  name: string
  relation: string
  derived: boolean
  former: boolean
  /** The stored link behind the row, when it's yours to change. */
  link?: Relationship
}

// More former connections than this and the group starts folded (screen 2n).
const OPEN_FORMER_UP_TO = 2

const connects = (link: Relationship, one: string, other: string) =>
  [link.person_a.id, link.person_b.id].sort().join() === [one, other].sort().join()

/** The stored link a family row comes from: an "other family" link, a parent or a partner. */
function storedLink(relation: FamilyRelation, personId: string, links: Relationship[]) {
  if (relation.direct_link_id) return links.find((link) => link.id === relation.direct_link_id)
  if (relation.derived) return undefined
  const type = relation.relation === 'partner' ? 'partner' : 'parent'
  const parent = relation.relation === 'parent' ? relation.person.id : personId
  return links.find(
    (link) =>
      link.type === type &&
      link.is_former === relation.former &&
      connects(link, personId, relation.person.id) &&
      (type !== 'parent' || link.person_a.id === parent),
  )
}

function familyRow(relation: FamilyRelation, link?: Relationship): Row {
  return {
    key: `family-${relation.person.id}-${relation.relation}`,
    group: 'family',
    personId: relation.person.id,
    name: relation.person.name,
    relation: relationLabel(relation.relation, relation.pronouns),
    derived: relation.derived,
    former: relation.former,
    link: link?.is_mine ? link : undefined,
  }
}

function linkRow(link: Relationship, personId: string): Row {
  const other = link.person_a.id === personId ? link.person_b : link.person_a
  return {
    key: `link-${link.id}`,
    group: 'other',
    personId: other.id,
    name: other.name,
    relation: linkLabel(link),
    derived: false,
    former: link.is_former,
    link: link.is_mine ? link : undefined,
  }
}

type RowActions = {
  onChange: (link: Relationship) => void
  onEnd: (link: Relationship) => void
  onReopen: (link: Relationship) => void
  onRemove: (link: Relationship) => void
}

function Rows({ rows, actions }: { rows: Row[]; actions: RowActions }) {
  return (
    <ul className="flex flex-col">
      {rows.map((row) => (
        <li key={row.key} className="flex items-center gap-1">
          <Link
            to="/people/$personId"
            params={{ personId: row.personId }}
            className="flex min-w-0 flex-1 items-baseline gap-3 rounded-tab px-2 py-2 hover:bg-hover"
          >
            <span className="font-serif text-lg">{row.name}</span>
            <span className="ml-auto text-md text-ink-soft">
              {row.former && 'former '}
              {row.relation}
            </span>
            {row.derived && (
              <span
                title="Worked out from other links, not entered directly"
                className="type-meta text-ink-faint"
              >
                derived
              </span>
            )}
          </Link>
          {row.link ? (
            <RowMenu row={row} link={row.link} actions={actions} />
          ) : (
            // Keeps the relation words lined up with the rows that have a menu.
            <span aria-hidden className="w-9 flex-none" />
          )}
        </li>
      ))}
    </ul>
  )
}

/** Change, end, reopen or remove one of your links (screen 2m). */
function RowMenu({ row, link, actions }: { row: Row; link: Relationship; actions: RowActions }) {
  const firstName = row.name.split(' ')[0]
  return (
    <MenuRoot>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" aria-label={`${row.name}: change or end`} className="w-9 px-0">
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className={menuContentClass}>
          <DropdownMenu.Item className={menuItemClass} onSelect={() => actions.onChange(link)}>
            Change type
          </DropdownMenu.Item>
          <DropdownMenu.Item className={menuItemClass} asChild>
            <Link to="/people/$personId" params={{ personId: row.personId }}>
              Open {firstName}&apos;s page
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className={menuSeparatorClass} />
          {link.is_former ? (
            <DropdownMenu.Item className={menuItemClass} onSelect={() => actions.onReopen(link)}>
              Reopen
            </DropdownMenu.Item>
          ) : (
            link.type !== 'parent' && (
              <DropdownMenu.Item className={menuItemClass} onSelect={() => actions.onEnd(link)}>
                End this relationship…
              </DropdownMenu.Item>
            )
          )}
          <DropdownMenu.Item
            className={cn(menuItemClass, 'text-danger')}
            onSelect={() => actions.onRemove(link)}
          >
            Remove the link
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </MenuRoot>
  )
}

/** Undo for "Remove the link": put it back as it was, ended or not. */
async function restore(queryClient: QueryClient, link: Relationship) {
  const again = await createRelationship(queryClient, {
    person_a_id: link.person_a.id,
    person_b_id: link.person_b.id,
    type: link.type,
    parent_type: link.parent_type,
    label: link.label,
    started_on: link.started_on,
    space_id: link.space?.id ?? null,
  })
  if (link.is_former) await endRelationship(queryClient, again.id, link.ended_on)
}

/** Run a write; if it fails, say so in a toast. */
function attempt(failed: string, write: () => Promise<unknown>) {
  write().catch((error: Error) => notify({ title: failed, description: error.message }))
}

/** Family (stored and worked out), other links, and a Former group (screens 1b, 2m, 2n). */
export function ConnectionsSection({ personId }: { personId: string }) {
  const queryClient = useQueryClient()
  const { openConnect, openChange } = useConnectionForm()
  const person = useQuery(personQuery(personId)).data
  const family = useQuery(familyQuery(personId)).data ?? []
  const familyLinks = useQuery(familyLinksQuery(personId)).data ?? []
  const links = useQuery(otherLinksQuery(personId)).data ?? []
  const rows = [
    ...family.map((relation) => familyRow(relation, storedLink(relation, personId, familyLinks))),
    ...links.map((link) => linkRow(link, personId)),
  ]
  const current = (group: Row[]) => group.filter((row) => !row.former)
  const familyRows = current(rows.filter((row) => row.group === 'family'))
  const otherRows = current(rows.filter((row) => row.group === 'other'))
  const formerRows = rows.filter((row) => row.former)
  const [showFormer, setShowFormer] = useState<boolean | null>(null)
  const formerOpen = showFormer ?? formerRows.length <= OPEN_FORMER_UP_TO
  const currentCount = familyRows.length + otherRows.length
  const [ending, setEnding] = useState<Relationship | null>(null)
  const [endShown, endClosing] = useClosing(ending)

  const actions: RowActions = {
    onChange: (link) => openChange(personId, link),
    onEnd: setEnding,
    onReopen: (link) =>
      attempt("Couldn't reopen it", () => reopenRelationship(queryClient, link.id)),
    onRemove: (link) =>
      attempt("Couldn't remove it", async () => {
        await deleteRelationship(queryClient, link.id)
        notify({
          title: 'Link removed',
          action: {
            label: 'Undo',
            onClick: () => attempt("Couldn't undo that", () => restore(queryClient, link)),
          },
        })
      }),
  }

  return (
    <ProfileSection
      title="Connections"
      meta={
        rows.length > 0 &&
        [`${currentCount} current`, formerRows.length > 0 && `${formerRows.length} former`]
          .filter(Boolean)
          .join(' · ')
      }
      action={
        <Button variant="ghost" onClick={() => openConnect(personId)}>
          <Plus aria-hidden />
          Add
        </Button>
      }
    >
      {rows.length === 0 ? (
        <p className="type-small text-ink-soft">No connections yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {familyRows.length > 0 && (
            <div>
              <h3 className="px-2 pb-1 type-meta text-ink-faint">Family</h3>
              <Rows rows={familyRows} actions={actions} />
            </div>
          )}
          {otherRows.length > 0 && (
            <div>
              <h3 className="px-2 pb-1 type-meta text-ink-faint">Other</h3>
              <Rows rows={otherRows} actions={actions} />
            </div>
          )}
          {formerRows.length > 0 && (
            <div className="rounded-card border border-dashed border-line-strong p-2">
              <div className="flex items-center gap-2 px-2">
                <h3 className="type-meta text-ink-faint">Former · {formerRows.length}</h3>
                <Button
                  variant="ghost"
                  aria-expanded={formerOpen}
                  className="ml-auto h-9 md:h-8"
                  onClick={() => setShowFormer(!formerOpen)}
                >
                  {formerOpen ? 'Hide' : 'Show'}
                </Button>
              </div>
              {formerOpen && (
                <>
                  <Rows rows={formerRows} actions={actions} />
                  <p className="px-2 pt-1 type-small text-ink-faint">
                    Still in the graph, just not in the foreground.
                  </p>
                </>
              )}
            </div>
          )}
          <Link
            to="/graph"
            className="self-start px-2 text-md font-medium text-accent hover:underline"
          >
            See in graph →
          </Link>
        </div>
      )}
      {person && !person.is_me && (
        <Link
          to="/graph"
          search={{ how: personId }}
          className="mt-3 inline-block px-2 text-md font-medium text-accent hover:underline"
        >
          How do I know {person.name.split(' ')[0]}?
        </Link>
      )}
      {endShown && person && (
        <EndConnectionDialog
          personId={personId}
          personName={person.name}
          link={endShown}
          open={!endClosing}
          onClose={() => setEnding(null)}
        />
      )}
    </ProfileSection>
  )
}
