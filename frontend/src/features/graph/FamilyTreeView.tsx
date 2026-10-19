import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { ApiError } from '@/api/errors'
import { currentUserQuery } from '@/api/session'
import { SHORTCUTS } from '@/app/nav'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { PeekPanel } from '@/features/people/PeekPanel'
import { PersonSearch } from '@/features/people/PersonSearch'
import { countOf } from '@/features/person/labels'
import { useConnectionForm } from '@/features/person/useConnectionForm'
import { firstNameOf } from '@/lib/names'
import { useShortcut } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import { PERSON_GONE } from './copy'
import { FamilyTree } from './FamilyTree'
import { HowDoIKnow } from './HowDoIKnow'
import { ModeSwitch } from './ModeSwitch'
import { NodeSheet } from './NodeSheet'
import { familyTreeQuery } from './queries'
import { Toggle } from './Toggle'
import { generationSpan, shownPeople, type TreeToggles } from './treeLayout'

/** Family tree mode (screens 3k, 3l): someone's family by generation. */
export function FamilyTreeView({ rootId }: { rootId: string }) {
  const navigate = useNavigate({ from: '/graph' })
  const meId = useQuery(currentUserQuery).data?.me?.id
  const tree = useQuery(familyTreeQuery(rootId))
  const [toggles, setToggles] = useState<TreeToggles>({ formerPartners: true, inLaws: true })
  const [picked, setPicked] = useState<string | null>(null)
  const { openConnect } = useConnectionForm()

  const shown = useMemo(
    () => (tree.data ? shownPeople(tree.data, toggles) : []),
    [tree.data, toggles],
  )
  // Someone a toggle just hid isn't open beside the tree.
  const selected = picked && shown.some((person) => person.id === picked) ? picked : null
  const root = tree.data?.people.find((person) => person.id === rootId)
  const span = generationSpan(shown)

  const showTree = (personId: string) => {
    setPicked(null)
    void navigate({ search: { tree: personId } })
  }
  const showRoute = (personId: string) => void navigate({ search: { how: personId } })
  // Esc goes back to the network, once an open peek has closed (the peek takes Esc first).
  useShortcut(SHORTCUTS.back, () => void navigate({ search: {} }), { enabled: !selected })

  const note = (() => {
    if (tree.error instanceof ApiError && tree.error.status === 404) return PERSON_GONE
    if (tree.error) return <span className="text-danger">{tree.error.message}</span>
    if (!tree.data) return 'Drawing the tree…'
    return null
  })()

  return (
    <div
      className={cn(
        'h-[calc(100dvh-7rem)] px-4 pt-6 pb-2 md:h-dvh md:px-8 md:pb-6',
        selected && 'md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] md:gap-6',
      )}
    >
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <PageHeader
          title="Graph"
          meta={tree.data && `Family · ${countOf(shown.length, 'person', 'people')}`}
          actions={<ModeSwitch mode="tree" onChange={() => void navigate({ search: {} })} />}
        />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <TreeOf name={root?.name} onPick={showTree} />
          <Toggle
            pressed={toggles.formerPartners}
            onClick={() => setToggles({ ...toggles, formerPartners: !toggles.formerPartners })}
          >
            Former partners
          </Toggle>
          <Toggle
            pressed={toggles.inLaws}
            onClick={() => setToggles({ ...toggles, inLaws: !toggles.inLaws })}
          >
            In-laws
          </Toggle>
          <div className="w-full md:ml-auto md:w-auto">
            <HowDoIKnow meId={meId} onPick={showRoute} onClear={() => {}} />
          </div>
        </div>
        {tree.data && (
          <p className="mt-3 type-meta text-ink-faint">
            {countOf(span.up, 'generation')} up · {span.down} down
          </p>
        )}
        <div className="relative mt-3 flex min-h-64 flex-1 flex-col overflow-hidden rounded-card border border-line bg-paper">
          {note && <p className="py-16 text-center text-ink-soft">{note}</p>}
          {tree.data && root && tree.data.people.length === 1 && (
            <div className="flex flex-wrap items-center justify-center gap-3 border-b border-line px-4 py-3">
              <p className="text-ink-soft">No family linked to {firstNameOf(root.name)} yet.</p>
              <Button variant="secondary" onClick={() => openConnect(rootId)}>
                Connect…
              </Button>
            </div>
          )}
          {tree.data && (
            <div className="min-h-0 flex-1">
              <FamilyTree
                data={tree.data}
                toggles={toggles}
                selected={selected}
                onSelect={setPicked}
                onAddParent={(personId) => openConnect(personId, 'parent')}
              />
            </div>
          )}
        </div>
      </div>
      {selected && (
        <>
          <PeekPanel
            personId={selected}
            onClose={() => setPicked(null)}
            actions={
              <>
                <Button variant="ghost" onClick={() => showTree(selected)}>
                  Show their tree
                </Button>
                {selected !== meId && (
                  <Button variant="ghost" onClick={() => showRoute(selected)}>
                    How do I know them?
                  </Button>
                )}
              </>
            }
          />
          <NodeSheet
            personId={selected}
            onClose={() => setPicked(null)}
            primary={{ label: 'Show their tree', onClick: () => showTree(selected) }}
            onHow={() => showRoute(selected)}
          />
        </>
      )}
    </div>
  )
}

/** "Tree of Ela (me)", and a search to pick someone else's. */
function TreeOf({
  name,
  onPick,
}: {
  name: string | undefined
  onPick: (personId: string) => void
}) {
  const [picking, setPicking] = useState(false)
  if (picking) {
    return (
      <div className="w-full md:w-72">
        <PersonSearch
          id="tree-of"
          label="Tree of"
          placeholder="Search your notebook"
          autoFocus
          onPick={(person) => {
            setPicking(false)
            onPick(person.id)
          }}
        />
      </div>
    )
  }
  return (
    <div className="flex h-11 items-center gap-2 rounded-card border border-line-input bg-card pr-1 pl-3 md:h-9">
      <span className="type-meta text-ink-faint">Tree of</span>
      <span className="max-w-48 truncate font-medium">{name ?? '…'}</span>
      <Button
        variant="ghost"
        className="h-9 md:h-7"
        onClick={() => setPicking(true)}
        aria-label="Pick whose tree"
      >
        Change
      </Button>
    </div>
  )
}
