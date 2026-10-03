import { useQuery } from '@tanstack/react-query'
import { useNavigate, type LinkProps } from '@tanstack/react-router'
import { Command } from 'cmdk'
import { FolderPlus, Pilcrow, Plus, Settings, StickyNote, UserPlus, UserRound } from 'lucide-react'
import { useDeferredValue, useState, type ReactNode } from 'react'
import { Kbd } from '@/components/ui/kbd'
import { usePersonForm } from '@/features/person/usePersonForm'
import { searchQuery } from '@/features/search/queries'
import { peopleCount } from '@/features/spaces/labels'
import { spacesQuery } from '@/features/spaces/queries'
import { useSpaceForm } from '@/features/spaces/useSpaceForm'
import type { Shortcut } from '@/lib/shortcuts'
import { SECTIONS, SHORTCUTS } from './nav'

const GROUP =
  '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:type-label [&_[cmdk-group-heading]]:text-ink-faint'

const PAGES = [
  ...SECTIONS.map(({ to, label, icon: Icon }) => ({
    to,
    label,
    icon: <Icon className="size-4" />,
  })),
  { to: '/spaces', label: 'Spaces', icon: <FolderPlus className="size-4" /> },
  { to: '/settings', label: 'Settings', icon: <Settings className="size-4" /> },
] as const

/**
 * Search everything you can see, jump to a page or start something (screens 4x–4z, 6i).
 * The command palette shows it in a dialog; phones get it as the Search page.
 */
export function SearchCommand({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  const { openNew } = usePersonForm()
  const { openNew: openNewSpace } = useSpaceForm()
  const [text, setText] = useState('')
  const q = useDeferredValue(text.trim())
  const results = useQuery({ ...searchQuery(q), enabled: q.length > 0 }).data
  const spaces = useQuery(spacesQuery).data?.items ?? []
  const pages = q
    ? PAGES.filter((page) => page.label.toLowerCase().includes(q.toLowerCase()))
    : PAGES
  const nothing =
    q.length > 0 &&
    results !== undefined &&
    results.people.length +
      results.spaces.length +
      results.memory_aids.length +
      results.notes.length ===
      0

  // The first item, in the order the list shows them (values as on each Item).
  const first =
    (nothing && results?.did_you_mean && `person ${results.did_you_mean.id}`) ||
    (q && results?.people[0] && `person ${results.people[0].id}`) ||
    (q && results?.spaces[0] && `space ${results.spaces[0].id}`) ||
    (q && results?.memory_aids[0] && `aid ${results.memory_aids[0].id}`) ||
    (q && results?.notes[0] && `note ${results.notes[0].person.id}`) ||
    (pages[0] && `page ${pages[0].to}`) ||
    (!q && spaces[0] && `space ${spaces[0].id}`) ||
    'add person'
  // Results arrive after typing, and whatever was highlighted may be gone by then: start
  // again from the top whenever the list changes, so Enter always opens something.
  const [selected, setSelected] = useState(first)
  const [listTop, setListTop] = useState(first)
  if (first !== listTop) {
    setListTop(first)
    setSelected(first)
  }

  const go = (to: LinkProps['to'], params?: LinkProps['params']) => () => {
    onDone()
    void navigate({ to, params })
  }
  const openPerson = (personId: string) => go('/people/$personId', { personId })
  const then = (action: () => void) => () => {
    onDone()
    action()
  }

  return (
    <Command loop shouldFilter={false} label="Search" value={selected} onValueChange={setSelected}>
      <Command.Input
        value={text}
        onValueChange={setText}
        placeholder="Search people, notes, spaces… or jump somewhere"
        className="h-13 w-full border-b border-line bg-transparent px-4 text-base outline-none placeholder:text-ink-faint"
      />
      <Command.List className="max-h-[60vh] overflow-y-auto p-1.5">
        {nothing && (
          <div className="px-3 pt-5 pb-2 text-center">
            <p className="type-heading">Nothing matches “{q}”</p>
            <p className="mt-1 type-small text-ink-soft">
              Not in names, notes, memory aids, spaces or tags you can see.
            </p>
          </div>
        )}
        {results?.did_you_mean && nothing && (
          <Command.Group heading="Did you mean" className={GROUP}>
            <Item
              value={`person ${results.did_you_mean.id}`}
              onSelect={openPerson(results.did_you_mean.id)}
              icon={<UserRound className="size-4" />}
            >
              {results.did_you_mean.name}
            </Item>
          </Command.Group>
        )}
        {q && results && results.people.length > 0 && (
          <Command.Group heading="People" className={GROUP}>
            {results.people.map((person) => (
              <Item
                key={person.id}
                value={`person ${person.id}`}
                onSelect={openPerson(person.id)}
                icon={<UserRound className="size-4" />}
                detail={person.how_we_met || person.spaces.map((space) => space.name).join(' · ')}
              >
                {person.name}
              </Item>
            ))}
          </Command.Group>
        )}
        {q && results && results.spaces.length > 0 && (
          <Command.Group heading="Spaces" className={GROUP}>
            {results.spaces.map((space) => (
              <Item
                key={space.id}
                value={`space ${space.id}`}
                onSelect={go('/spaces/$spaceId', { spaceId: space.id })}
                icon={<SpaceMark color={space.color} />}
                detail={peopleCount(space.people_count)}
              >
                {space.name}
              </Item>
            ))}
          </Command.Group>
        )}
        {q && results && results.memory_aids.length > 0 && (
          <Command.Group heading="Memory aids" className={GROUP}>
            {results.memory_aids.map((aid) => (
              <Item
                key={aid.id}
                value={`aid ${aid.id}`}
                onSelect={openPerson(aid.person.id)}
                icon={<StickyNote className="size-4" />}
                detail={`on ${aid.person.name}`}
              >
                {aid.text}
              </Item>
            ))}
          </Command.Group>
        )}
        {q && results && results.notes.length > 0 && (
          <Command.Group heading="Notes" className={GROUP}>
            {results.notes.map((note) => (
              <Item
                key={note.person.id}
                value={`note ${note.person.id}`}
                onSelect={openPerson(note.person.id)}
                icon={<Pilcrow className="size-4" />}
                detail={`${note.person.name} · note`}
              >
                {note.snippet}
              </Item>
            ))}
          </Command.Group>
        )}
        {pages.length > 0 && (
          <Command.Group heading="Go to" className={GROUP}>
            {pages.map((page) => (
              <Item key={page.to} value={`page ${page.to}`} onSelect={go(page.to)} icon={page.icon}>
                {page.label}
              </Item>
            ))}
          </Command.Group>
        )}
        {!q && spaces.length > 0 && (
          <Command.Group heading="Spaces" className={GROUP}>
            {spaces.map((space) => (
              <Item
                key={space.id}
                value={`space ${space.id}`}
                onSelect={go('/spaces/$spaceId', { spaceId: space.id })}
                icon={<SpaceMark color={space.color} />}
              >
                {space.name}
              </Item>
            ))}
          </Command.Group>
        )}
        <Command.Group heading="Actions" className={GROUP}>
          <Item
            value="add person"
            onSelect={then(() => openNew(q ? { name: capitalized(q) } : undefined))}
            icon={<UserPlus className="size-4" />}
            shortcut={SHORTCUTS.addPerson}
          >
            {q ? `Add “${capitalized(q)}” as a new person` : 'Add person'}
          </Item>
          <Item
            value="quick capture"
            onSelect={go('/capture')}
            icon={<Plus className="size-4" />}
            shortcut={SHORTCUTS.quickCapture}
          >
            Quick capture
          </Item>
          {!q && (
            <Item
              value="new space"
              onSelect={then(openNewSpace)}
              icon={<FolderPlus className="size-4" />}
            >
              New space
            </Item>
          )}
        </Command.Group>
      </Command.List>
      <p className="border-t border-line px-4 py-2 type-meta text-ink-faint">
        Searches only what you can see
      </p>
    </Command>
  )
}

/** "tahir" → "Tahir", for a name typed in lower case. */
const capitalized = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1)

function SpaceMark({ color }: { color: string }) {
  return <span data-space={color} className="mx-1.5 h-3.75 w-0.75 rounded-full bg-space" />
}

type ItemProps = {
  children: string
  icon: ReactNode
  onSelect: () => void
  /** What makes each item unique to cmdk (it doesn't filter: search does that). */
  value: string
  detail?: string
  shortcut?: Shortcut
}

function Item({ children, icon, onSelect, value, detail, shortcut }: ItemProps) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex min-h-10 cursor-pointer items-center gap-3 rounded-tab px-2.5 py-1.5 text-input text-ink-soft data-[selected=true]:bg-hover data-[selected=true]:text-ink"
    >
      <span aria-hidden className="flex w-4 flex-none justify-center">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{children}</span>
        {detail && <span className="block truncate type-small text-ink-faint">{detail}</span>}
      </span>
      {shortcut && <Kbd shortcut={shortcut} className="ml-auto hidden text-ink-faint md:inline" />}
    </Command.Item>
  )
}
