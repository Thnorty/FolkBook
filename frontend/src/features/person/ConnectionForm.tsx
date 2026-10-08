import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { useDeferredValue, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { components } from '@/api/schema'
import { Choice } from '@/components/ui/choice'
import { FormDialogFooter } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { labelClass } from '@/components/ui/label'
import { pickerListClass } from '@/components/ui/menu'
import { Button } from '@/components/ui/button'
import { peopleListQuery } from '@/features/people/queries'
import { warnAt } from '@/lib/fieldWarnings'
import { cn } from '@/lib/utils'
import { canAddPeople, spacesQuery } from '@/features/spaces/queries'
import {
  KIND_GROUPS,
  kindChip,
  kindOf,
  needsLabel,
  needsParentType,
  type ConnectionKind,
} from './connectionKinds'
import type { PersonDetail, Relationship } from './queries'

type ParentType = components['schemas']['ParentType']
type SpaceRef = components['schemas']['SpaceRef']
type Other = { id: string; name: string; spaces: SpaceRef[] } | { newName: string }

/** What the form hands back; the provider turns it into API calls. */
export type ConnectionFormResult = {
  other: { id: string } | { newName: string }
  kind: ConnectionKind
  parentType: ParentType | null
  label: string
  startedOn: string | null
  spaceId: string | null
}

type ConnectionFormProps = {
  /** The person whose profile this is. */
  person: PersonDetail
  /** The link being changed ("Change type"); nothing when adding one. */
  link?: Relationship
  formId: string
  saving: boolean
  error?: string
  onSubmit: (result: ConnectionFormResult) => void
  onCancel: () => void
}

const PARENT_TYPES: Record<ParentType, string> = {
  biological: 'Biological',
  adoptive: 'Adoptive',
  step: 'Step',
}

/** Connect someone to this person, or change how they're connected (screens 2k, 2l). */
export function ConnectionForm({
  person,
  link,
  formId,
  saving,
  error,
  onSubmit,
  onCancel,
}: ConnectionFormProps) {
  const firstName = person.name.split(' ')[0]
  const linked = link && (link.person_a.id === person.id ? link.person_b : link.person_a)
  const [other, setOther] = useState<Other | null>(linked ? { ...linked, spaces: [] } : null)
  const [kind, setKind] = useState<ConnectionKind | null>(link ? kindOf(link, person.id) : null)
  const [parentType, setParentType] = useState<ParentType>(link?.parent_type ?? 'biological')
  const [label, setLabel] = useState(link?.label ?? '')
  const [startedOn, setStartedOn] = useState(link?.started_on ?? '')
  // Until you pick one, a link goes in a space both people share, if there is one.
  const [pickedSpace, setPickedSpace] = useState<string | null>(null)
  const sharedSpaces = useSharedSpaces(person, other)
  const spaceId = pickedSpace ?? sharedSpaces[0]?.id ?? ''
  const kinds = useRef<HTMLDivElement>(null)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!other) {
      const who = event.currentTarget.querySelector<HTMLInputElement>('#connect-who')
      if (who) warnAt(who, 'Pick who first.')
      return
    }
    if (!kind) {
      const group = kinds.current
      const firstRow = group?.querySelector<HTMLElement>('fieldset > div')
      if (group) warnAt(group, `Pick how they're connected to ${firstName}.`, firstRow ?? group)
      return
    }
    onSubmit({
      other: 'id' in other ? { id: other.id } : other,
      kind,
      parentType: needsParentType(kind) ? parentType : null,
      label: needsLabel(kind) ? label.trim() : '',
      startedOn: startedOn || null,
      spaceId: spaceId || null,
    })
  }

  const kindChoices = (kinds: readonly ConnectionKind[]) => (
    <div className="flex flex-wrap gap-1.5">
      {kinds.map((option) => (
        <Choice key={option} name="kind" checked={kind === option} onChange={() => setKind(option)}>
          {kindChip(option, firstName)}
        </Choice>
      ))}
    </div>
  )

  return (
    <form id={formId} onSubmit={submit} className="flex flex-col gap-5">
      {other ? (
        <div className="flex items-center gap-3 rounded-card border border-line bg-card px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-serif text-lg">
              {'id' in other ? other.name : other.newName}
            </p>
            {!('id' in other) && <p className="type-meta text-ink-faint">New person</p>}
          </div>
          {!link && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOther(null)
                setPickedSpace(null)
              }}
            >
              Change
            </Button>
          )}
        </div>
      ) : (
        <PersonPicker exclude={person.id} onPick={setOther} />
      )}

      <div ref={kinds} className="flex flex-col gap-5">
        <Group title="Family">
          {kindChoices(KIND_GROUPS.family)}
          {kind && needsParentType(kind) ? (
            <fieldset className="mt-3">
              <legend className={labelClass}>Which kind of parent</legend>
              <div className="flex gap-1.5">
                {(Object.keys(PARENT_TYPES) as ParentType[]).map((option) => (
                  <Choice
                    key={option}
                    name="parent-type"
                    look="box"
                    className="flex-1 md:flex-none"
                    checked={parentType === option}
                    onChange={() => setParentType(option)}
                  >
                    {PARENT_TYPES[option]}
                  </Choice>
                ))}
              </div>
            </fieldset>
          ) : (
            <Hint>
              Parents and partners are the load-bearing ones: siblings, cousins, grandparents and
              in-laws get worked out from them.
            </Hint>
          )}
        </Group>

        <Group title="Other family" meta="when you don't know the parents">
          {kindChoices(KIND_GROUPS.otherFamily)}
          <Hint>
            Saved as a direct link. If you add their parents later, FolkBook works this out by
            itself.
          </Hint>
        </Group>

        <Group title="Social">
          {kindChoices(KIND_GROUPS.social)}
          {kind && needsLabel(kind) && (
            <Input
              aria-label={
                kind === 'met_at' ? 'Where did they meet?' : 'What are they to each other?'
              }
              placeholder={kind === 'met_at' ? 'Hackathon 2026' : 'Bandmate, neighbour…'}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              required
              maxLength={200}
              autoFocus
              className="mt-3"
            />
          )}
        </Group>
      </div>

      <div className="flex flex-wrap gap-5">
        <div>
          <label htmlFor={`${formId}-since`} className={labelClass}>
            Since <span className="font-mono tracking-normal normal-case">optional</span>
          </label>
          <Input
            id={`${formId}-since`}
            type="date"
            value={startedOn}
            onChange={(event) => setStartedOn(event.target.value)}
            className="w-auto"
          />
        </div>
        {!link && (
          <fieldset>
            <legend className={labelClass}>Space</legend>
            <div className="flex flex-wrap gap-1.5">
              {[...sharedSpaces, { id: '', name: 'No space' }].map((space) => (
                <Choice
                  key={space.id}
                  name="space"
                  look="box"
                  checked={spaceId === space.id}
                  onChange={() => setPickedSpace(space.id)}
                >
                  {space.name}
                </Choice>
              ))}
            </div>
            <p className="mt-1.5 type-small text-ink-faint">
              {spaceId ? 'Everyone in the space sees this link.' : 'Only you see this link.'}
            </p>
          </fieldset>
        )}
      </div>

      {error && (
        <p role="alert" className="type-small text-danger">
          {error}
        </p>
      )}

      <FormDialogFooter
        small
        submitLabel={link ? 'Save' : 'Connect them'}
        busy={saving}
        onCancel={onCancel}
      />
    </form>
  )
}

function Group({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className={labelClass}>
        {title}
        {meta && <span className="ml-2 font-mono tracking-normal normal-case">{meta}</span>}
      </legend>
      {children}
    </fieldset>
  )
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="mt-2 type-small text-ink-faint">{children}</p>
}

/**
 * Spaces both people are in and you can add to: a link in a space needs both of them
 * there (the server checks; this only offers the choices that can work).
 */
function useSharedSpaces(person: PersonDetail, other: Other | null) {
  const editable = new Set(
    (useQuery(spacesQuery).data?.items ?? []).filter(canAddPeople).map((space) => space.id),
  )
  const theirs = new Set(other && 'id' in other ? other.spaces.map((space) => space.id) : [])
  return person.spaces.filter((space) => editable.has(space.id) && theirs.has(space.id))
}

/** "Step 1 · who?": search your notebook, or name someone new (screen 2l). */
function PersonPicker({ exclude, onPick }: { exclude: string; onPick: (other: Other) => void }) {
  const [search, setSearch] = useState('')
  const deferred = useDeferredValue(search.trim())
  const results = useInfiniteQuery({
    ...peopleListQuery({ search: deferred }),
    enabled: deferred.length > 0,
  })
  const matches = (results.data?.pages[0]?.items ?? [])
    .filter((match) => match.id !== exclude)
    .slice(0, 6)

  return (
    <div>
      <label htmlFor="connect-who" className={labelClass}>
        Who?
      </label>
      <Input
        id="connect-who"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search your notebook"
        autoComplete="off"
        autoFocus
      />
      {deferred && (
        <ul aria-label="People" className={pickerListClass}>
          {matches.map((match) => (
            <li key={match.id}>
              <button
                type="button"
                onClick={() => onPick(match)}
                className="flex w-full cursor-pointer items-baseline gap-3 rounded-tab px-2 py-2 text-left hover:bg-hover focus-visible:ring-3 focus-visible:ring-focus-glow focus-visible:outline-none"
              >
                <span className="font-serif text-lg">{match.name}</span>
                <span className="ml-auto truncate type-meta text-ink-faint">
                  {match.spaces.map((space) => space.name).join(' · ')}
                </span>
              </button>
            </li>
          ))}
          <li className={cn(matches.length > 0 && 'mt-1 border-t border-line pt-1')}>
            <button
              type="button"
              onClick={() => onPick({ newName: search.trim() })}
              className="flex w-full cursor-pointer items-center gap-2 rounded-tab px-2 py-2 text-left text-md font-medium text-accent hover:bg-hover focus-visible:ring-3 focus-visible:ring-focus-glow focus-visible:outline-none"
            >
              <UserPlus aria-hidden className="size-4" />
              Create “{search.trim()}” as a new person
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
