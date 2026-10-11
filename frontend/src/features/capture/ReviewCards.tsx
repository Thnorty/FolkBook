import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { components } from '@/api/schema'
import { StickyNote } from '@/components/notebook/StickyNote'
import { Choice } from '@/components/ui/choice'
import { Input } from '@/components/ui/input'
import { labelClass } from '@/components/ui/label'
import { selectClass } from '@/components/ui/select'
import { PersonSearch } from '@/features/people/PersonSearch'
import {
  INTERACTION_KINDS,
  PARENT_TYPES,
  relationLabel,
  type ParentType,
} from '@/features/person/labels'
import { formatBirthday } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { AIDS_PRIVATE, FIELD_NAMES, otherFamilyNote } from './copy'
import {
  inChosenSpace,
  ME,
  type AidItem,
  type ChangeItem,
  type ConnectionItem,
  type EntryItem,
  type Item,
  type PersonItem,
  type Resolved,
  type Review,
} from './review'

type LinkType = components['schemas']['RelationshipType']
type EntryKind = EntryItem['entryKind']

/** The link types offered as chips; the rest are in the list beside them. */
const COMMON_TYPES: LinkType[] = ['sibling', 'cousin', 'friend', 'colleague', 'partner', 'parent']
const ALL_TYPES: LinkType[] = [
  'parent',
  'partner',
  'sibling',
  'cousin',
  'grandparent',
  'aunt_uncle',
  'friend',
  'colleague',
  'classmate',
  'met_at',
  'custom',
]

export type CardProps<T extends Item> = {
  item: T
  review: Review
  spaceName: string | null
  onToggle: (id: string) => void
  onEdit: (id: string, changes: Partial<T>) => void
  onResolve: (ref: string, choice: Resolved) => void
}

const ACCENT: Record<Item['kind'], string> = {
  person: 'border-l-accent',
  change: 'border-l-line-strong',
  connection: 'border-l-line-strong',
  aid: 'border-l-note-yellow',
  entry: 'border-l-line-strong',
}

/** One suggestion: a checkbox with its title, then what can be edited. */
function Card({
  item,
  title,
  meta,
  disabled,
  note,
  onToggle,
  children,
}: {
  item: Item
  title: string
  meta?: ReactNode
  disabled?: boolean
  note?: ReactNode
  onToggle: (id: string) => void
  children?: ReactNode
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        'flex flex-col gap-3 rounded-card border border-l-3 border-line bg-card p-4 shadow-photo',
        ACCENT[item.kind],
        !item.ticked && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-3">
        <label className="flex flex-1 items-start gap-2.5">
          <input
            type="checkbox"
            checked={item.ticked}
            disabled={disabled}
            onChange={() => onToggle(item.id)}
            className="mt-0.5 size-4 shrink-0 accent-accent"
          />
          <span className="type-label text-ink-soft">{title}</span>
        </label>
        {meta && <span className="type-meta text-ink-faint">{meta}</span>}
      </div>
      {note && <p className="pl-6.5 type-small text-ink-faint">{note}</p>}
      {children && <div className="flex flex-col gap-3 pl-6.5">{children}</div>}
    </section>
  )
}

/** Who a ref is, for titles and lists: "You" for the writer. */
function nameOf(review: Review, ref: string): string {
  if (ref === ME) return 'You'
  const person = review.find((i): i is PersonItem => i.kind === 'person' && i.ref === ref)
  return person?.name.trim() || 'Someone'
}

/** Everyone a link, memory aid or entry can be about. */
function PeopleOptions({ review, me = false }: { review: Review; me?: boolean }) {
  const people = review.filter((i): i is PersonItem => i.kind === 'person')
  return (
    <>
      {me && <option value={ME}>You</option>}
      {people.map((person) => (
        <option key={person.ref} value={person.ref}>
          {nameOf(review, person.ref)}
        </option>
      ))}
    </>
  )
}

function Chip({
  children,
  onRemove,
  label,
}: {
  children: ReactNode
  onRemove?: () => void
  label?: string
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-paper px-2.5 py-0.5 type-small text-ink-soft">
      {children}
      {onRemove && (
        <button
          type="button"
          aria-label={label}
          onClick={onRemove}
          className="cursor-pointer rounded-full text-ink-faint hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      )}
    </span>
  )
}

export function PersonCard(props: CardProps<PersonItem>) {
  const { item } = props
  if (item.match === 'choose' || item.resolved === null) return <WhoIsCard {...props} />
  if (item.resolved?.as === 'existing') {
    const { candidate } = item.resolved
    return (
      <Card
        item={item}
        title={`Already in your book · ${item.resolved.name}`}
        onToggle={props.onToggle}
      >
        {candidate?.detail && <p className="type-small text-ink-soft">{candidate.detail}</p>}
      </Card>
    )
  }
  return <NewPersonCard {...props} />
}

function NewPersonCard({ item, spaceName, onToggle, onEdit }: CardProps<PersonItem>) {
  return (
    <Card
      item={item}
      title={`New person · ${item.name.trim() || '…'}`}
      meta="Not in your book yet"
      onToggle={onToggle}
    >
      <Input
        aria-label="Name"
        value={item.name}
        required={item.ticked}
        maxLength={200}
        onChange={(event) => onEdit(item.id, { name: event.target.value })}
        className="font-serif text-lg"
      />
      <div className="grid gap-2 md:grid-cols-2">
        <Input
          aria-label="How you met"
          placeholder="How you met"
          value={item.how_we_met}
          maxLength={300}
          onChange={(event) => onEdit(item.id, { how_we_met: event.target.value })}
        />
        <Input
          aria-label="Work"
          placeholder="Work"
          value={item.work}
          maxLength={200}
          onChange={(event) => onEdit(item.id, { work: event.target.value })}
        />
      </div>
      {(spaceName || item.birthday || item.tags.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {spaceName && <Chip>{spaceName}</Chip>}
          {item.birthday && (
            <Chip
              label="Leave out the birthday"
              onRemove={() => onEdit(item.id, { birthday: null })}
            >
              Birthday {formatBirthday(item.birthday)}
            </Chip>
          )}
          {item.tags.map((tag) => (
            <Chip
              key={tag}
              label={`Leave out the tag ${tag}`}
              onRemove={() => onEdit(item.id, { tags: item.tags.filter((t) => t !== tag) })}
            >
              {tag}
            </Chip>
          ))}
        </div>
      )}
    </Card>
  )
}

/** "Who is “Emma”?": the people it could be, someone new, or anyone else in your book. */
function WhoIsCard({ item, onToggle, onResolve }: CardProps<PersonItem>) {
  const title = `Who is “${item.name}”?`
  const chosen = item.resolved?.as === 'existing' ? item.resolved : null
  const picked = chosen && !item.candidates.some((c) => c.id === chosen.id) ? chosen : null
  return (
    <Card
      item={item}
      title={title}
      meta={item.resolved ? undefined : 'Needs you'}
      onToggle={onToggle}
    >
      <div
        id={`who-${item.ref}`}
        role="radiogroup"
        aria-label={title}
        tabIndex={-1}
        className="flex flex-col gap-2 outline-none"
      >
        {item.candidates.map((candidate) => (
          <Choice
            key={candidate.id}
            name={`who-${item.ref}`}
            look="box"
            checked={chosen?.id === candidate.id}
            onChange={() =>
              onResolve(item.ref, {
                as: 'existing',
                id: candidate.id,
                name: candidate.name,
                candidate,
              })
            }
          >
            <span className="flex w-full flex-col items-start py-1 text-left">
              <span className="font-serif text-base text-ink">{candidate.name}</span>
              {candidate.detail && (
                <span className="type-small text-ink-soft">{candidate.detail}</span>
              )}
            </span>
          </Choice>
        ))}
        {picked && (
          <Choice name={`who-${item.ref}`} look="box" checked onChange={() => {}}>
            <span className="w-full py-1 text-left font-serif text-base text-ink">
              {picked.name}
            </span>
          </Choice>
        )}
        <Choice
          name={`who-${item.ref}`}
          look="box"
          checked={item.resolved?.as === 'new'}
          onChange={() => onResolve(item.ref, { as: 'new' })}
        >
          <span className="w-full py-1 text-left">Someone else: create a new “{item.name}”</span>
        </Choice>
      </div>
      <PersonSearch
        id={`who-search-${item.ref}`}
        label="Or find them"
        placeholder="Search my people…"
        onPick={(person) =>
          onResolve(item.ref, { as: 'existing', id: person.id, name: person.name, candidate: null })
        }
      />
    </Card>
  )
}

export function ChangeCard({ item, onToggle }: CardProps<ChangeItem>) {
  const change = `${FIELD_NAMES[item.field]}: ${item.from ? `${item.from} → ` : ''}${item.to}`
  return (
    <Card
      item={item}
      title={`${item.name} · ${change}`}
      disabled={Boolean(item.disabled)}
      note={item.disabled}
      onToggle={onToggle}
    />
  )
}

export function ConnectionCard({
  item,
  review,
  spaceName,
  onToggle,
  onEdit,
}: CardProps<ConnectionItem>) {
  const a = nameOf(review, item.a)
  const b = nameOf(review, item.b)
  const where = spaceName && inChosenSpace(review, item) ? `In ${spaceName}` : 'Only you see it'
  const setType = (type: LinkType) =>
    onEdit(item.id, {
      type,
      parent_type: type === 'parent' ? (item.parent_type ?? 'biological') : null,
    })
  return (
    <Card
      item={item}
      title={`Connection · ${a} — ${b}`}
      meta={where}
      note={otherFamilyNote(item.type)}
      onToggle={onToggle}
    >
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Person"
          value={item.a}
          onChange={(event) => onEdit(item.id, { a: event.target.value })}
          className={cn(selectClass, 'w-auto font-serif')}
        >
          <PeopleOptions review={review} me />
        </select>
        <span aria-hidden className="text-ink-faint">
          —
        </span>
        <select
          aria-label="Other person"
          value={item.b}
          onChange={(event) => onEdit(item.id, { b: event.target.value })}
          className={cn(selectClass, 'w-auto font-serif')}
        >
          <option value="" disabled>
            Pick someone
          </option>
          <PeopleOptions review={review} me />
        </select>
      </div>
      <div role="radiogroup" aria-label="Kind of link" className="flex flex-wrap gap-1.5">
        {COMMON_TYPES.map((type) => (
          <Choice
            key={type}
            name={`type-${item.id}`}
            checked={item.type === type}
            onChange={() => setType(type)}
          >
            {relationLabel(type)}
          </Choice>
        ))}
        <select
          aria-label="Every kind of link"
          value={item.type}
          onChange={(event) => setType(event.target.value as LinkType)}
          className={cn(selectClass, 'w-auto')}
        >
          {ALL_TYPES.map((type) => (
            <option key={type} value={type}>
              {type === 'custom' ? 'something else' : relationLabel(type)}
            </option>
          ))}
        </select>
      </div>
      {item.type === 'parent' && (
        <label className="flex flex-wrap items-center gap-2 type-small text-ink-soft">
          {a} is {b}'s
          <select
            aria-label="Kind of parent"
            value={item.parent_type ?? 'biological'}
            onChange={(event) => onEdit(item.id, { parent_type: event.target.value as ParentType })}
            className={cn(selectClass, 'w-auto')}
          >
            {(Object.keys(PARENT_TYPES) as ParentType[]).map((type) => (
              <option key={type} value={type}>
                {PARENT_TYPES[type].toLowerCase()} parent
              </option>
            ))}
          </select>
        </label>
      )}
      {(item.type === 'met_at' || item.type === 'custom') && (
        <Input
          aria-label={item.type === 'met_at' ? 'Where you met' : 'What they are to each other'}
          placeholder={item.type === 'met_at' ? 'Hackathon 2026' : 'Bandmates'}
          value={item.label}
          required={item.ticked}
          maxLength={200}
          onChange={(event) => onEdit(item.id, { label: event.target.value })}
        />
      )}
    </Card>
  )
}

export function AidCard({ item, review, onToggle, onEdit }: CardProps<AidItem>) {
  return (
    <Card
      item={item}
      title={`Memory aid · on ${nameOf(review, item.about)}`}
      note={AIDS_PRIVATE}
      onToggle={onToggle}
    >
      <div className="flex items-start gap-4">
        <div className="flex flex-1 flex-col gap-2">
          <select
            aria-label="About"
            value={item.about}
            onChange={(event) => onEdit(item.id, { about: event.target.value })}
            className={cn(selectClass, 'w-auto self-start')}
          >
            <PeopleOptions review={review} />
          </select>
          <input
            aria-label="Memory aid"
            value={item.text}
            required={item.ticked}
            maxLength={300}
            placeholder="Likes climbing"
            onChange={(event) => onEdit(item.id, { text: event.target.value })}
            className="border-b border-dashed border-line-strong bg-transparent py-1 type-hand text-ink outline-none placeholder:text-ink-faint focus-visible:border-accent"
          />
        </div>
        {item.text.trim() && (
          <StickyNote seed={item.id} className="hidden w-40 md:block">
            {item.text}
          </StickyNote>
        )}
      </div>
    </Card>
  )
}

export function EntryCard({ item, review, onToggle, onEdit }: CardProps<EntryItem>) {
  return (
    <Card item={item} title={`Timeline entry · ${nameOf(review, item.about)}`} onToggle={onToggle}>
      <div className="grid gap-2 md:grid-cols-3">
        <select
          aria-label="With"
          value={item.about}
          onChange={(event) => onEdit(item.id, { about: event.target.value })}
          className={selectClass}
        >
          <PeopleOptions review={review} />
        </select>
        <select
          aria-label="Kind"
          value={item.entryKind}
          onChange={(event) => onEdit(item.id, { entryKind: event.target.value as EntryKind })}
          className={selectClass}
        >
          {(Object.keys(INTERACTION_KINDS) as EntryKind[]).map((kind) => (
            <option key={kind} value={kind}>
              {INTERACTION_KINDS[kind]}
            </option>
          ))}
        </select>
        <Input
          type="date"
          aria-label="Day"
          value={item.date}
          required={item.ticked}
          onChange={(event) => onEdit(item.id, { date: event.target.value })}
        />
      </div>
      <div className="grid gap-2 md:grid-cols-[1fr_2fr]">
        <Input
          aria-label="Title"
          placeholder={INTERACTION_KINDS[item.entryKind]}
          value={item.label}
          required={item.ticked && item.entryKind === 'custom'}
          maxLength={100}
          onChange={(event) => onEdit(item.id, { label: event.target.value })}
        />
        <Input
          aria-label="Note"
          placeholder="What happened"
          value={item.note}
          maxLength={5000}
          onChange={(event) => onEdit(item.id, { note: event.target.value })}
        />
      </div>
      <span className={cn(labelClass, 'mb-0')}>Private to you, on their timeline</span>
    </Card>
  )
}
