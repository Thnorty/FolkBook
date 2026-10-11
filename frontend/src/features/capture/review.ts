import { countOf } from '@/features/person/labels'
import { formatBirthday, isoDay } from '@/lib/dates'
import { firstNameOf, fold, words } from '@/lib/names'
import type { Candidate, Draft, SaveBody, Saved, Undone } from './queries'

/*
 * What the review holds: one item per card, in the order the cards show (people, changes,
 * connections, memory aids, entries). Plain data and plain functions, so the page only
 * draws it. Refs ("t", "e") tie the parts to the people; "me" is the writer.
 */

type Birthday = Draft['people'][number]['birthday']
type Connection = Draft['connections'][number]
type Entry = Draft['entries'][number]

export const ME = 'me'

export type Resolved =
  | { as: 'new' }
  // `candidate` is null for someone picked with search: no changes are offered then.
  | { as: 'existing'; id: string; name: string; candidate: Candidate | null }

export type PersonItem = {
  kind: 'person'
  id: string
  ref: string
  name: string
  how_we_met: string
  work: string
  birthday: Birthday
  tags: string[]
  match: Draft['people'][number]['match']
  candidates: Candidate[]
  resolved: Resolved | null // null: "Who is …?" still needs an answer
  ticked: boolean
}

export type ChangeField = 'how_we_met' | 'work' | 'birthday' | 'tags'

export type ChangeItem = {
  kind: 'change'
  id: string
  ref: string
  name: string // the existing person's
  field: ChangeField
  from: string
  to: string
  value: string | NonNullable<Birthday> | string[] // what is saved; tags: the added ones
  disabled?: string // why it can't be made
  ticked: boolean
}

export type ConnectionItem = Omit<Connection, 'id'> & {
  kind: 'connection'
  id: string
  ticked: boolean
}

export type AidItem = { kind: 'aid'; id: string; about: string; text: string; ticked: boolean }

export type EntryItem = Omit<Entry, 'kind'> & {
  kind: 'entry'
  entryKind: Entry['kind']
  ticked: boolean
}

export type Item = PersonItem | ChangeItem | ConnectionItem | AidItem | EntryItem
export type Review = Item[]
export type AddKind = 'person' | 'connection' | 'aid' | 'entry'

const ORDER: Item['kind'][] = ['person', 'change', 'connection', 'aid', 'entry']
const ordered = (review: Review) =>
  review.toSorted((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))

/** Every suggestion ticked; a full-name match is resolved, a first name waits for you. */
export function fromDraft(draft: Draft): Review {
  const people = draft.people.map((person): PersonItem => ({
    kind: 'person',
    id: person.ref,
    ref: person.ref,
    name: person.name,
    how_we_met: person.how_we_met ?? '',
    work: person.work ?? '',
    birthday: person.birthday,
    tags: person.tags,
    match: person.match,
    candidates: person.candidates,
    resolved:
      person.match === 'new'
        ? { as: 'new' }
        : person.match === 'match'
          ? existing(person.candidates[0])
          : null,
    ticked: true,
  }))
  return ordered([
    ...people,
    ...people.flatMap((person) =>
      person.resolved?.as === 'existing' && person.resolved.candidate
        ? changesFor(person, person.resolved.candidate)
        : [],
    ),
    ...draft.connections.map((c): ConnectionItem => ({ ...c, kind: 'connection', ticked: true })),
    ...draft.memory_aids.map((a): AidItem => ({ ...a, kind: 'aid', ticked: true })),
    ...draft.entries.map(({ kind, ...entry }): EntryItem => ({
      ...entry,
      kind: 'entry',
      entryKind: kind,
      ticked: true,
    })),
  ])
}

const existing = (candidate: Candidate): Resolved => ({
  as: 'existing',
  id: candidate.id,
  name: candidate.name,
  candidate,
})

const sameBirthday = (a: Birthday, b: Birthday) =>
  a?.day === b?.day && a?.month === b?.month && (a?.year ?? null) === (b?.year ?? null)

/** "Work: Google → Spotify": what the AI read that differs from what they have. */
export function changesFor(person: PersonItem, candidate: Candidate): ChangeItem[] {
  const { current } = candidate
  const owner = candidate.owner ? firstNameOf(candidate.owner.name) : 'Someone else'
  const why = `${owner}'s person: you can't change their details.`
  const change = (
    field: ChangeField,
    from: string,
    to: string,
    value: ChangeItem['value'],
    can: boolean,
  ): ChangeItem => ({
    kind: 'change',
    id: `${person.ref}:${field}`,
    ref: person.ref,
    name: candidate.name,
    field,
    from,
    to,
    value,
    ticked: can,
    ...(can ? {} : { disabled: why }),
  })

  const changes: ChangeItem[] = []
  for (const field of ['how_we_met', 'work'] as const) {
    const to = person[field].trim()
    if (to && to !== current[field])
      changes.push(change(field, current[field], to, to, candidate.can_edit))
  }
  if (person.birthday && !sameBirthday(person.birthday, current.birthday)) {
    const from = current.birthday ? formatBirthday(current.birthday) : ''
    changes.push(
      change(
        'birthday',
        from,
        formatBirthday(person.birthday),
        person.birthday,
        candidate.can_edit,
      ),
    )
  }
  const have = new Set(current.tags.map(fold))
  const added = person.tags.filter((tag) => !have.has(fold(tag)))
  if (added.length) changes.push(change('tags', '', added.join(', '), added, candidate.can_tag))
  return changes
}

/** The refs an item is about: unticking one of these people unticks the item. */
function refsOf(item: Item): string[] {
  switch (item.kind) {
    case 'person':
    case 'change':
      return [item.ref]
    case 'connection':
      return [item.a, item.b].filter((ref) => ref !== ME)
    case 'aid':
    case 'entry':
      return [item.about]
  }
}

/**
 * Tick or untick one item. Unticking a person unticks everything about them; ticking them
 * brings back only the person. Ticking an item ticks the people it's about.
 */
export function toggle(review: Review, id: string): Review {
  const item = review.find((i) => i.id === id)
  if (!item || (item.kind === 'change' && item.disabled)) return review
  if (item.ticked && item.kind === 'person') {
    return review.map((i) =>
      i === item || refsOf(i).includes(item.ref) ? { ...i, ticked: false } : i,
    )
  }
  if (item.ticked) return review.map((i) => (i === item ? { ...i, ticked: false } : i))
  const refs = refsOf(item)
  return review.map((i) =>
    i === item || (i.kind === 'person' && refs.includes(i.ref)) ? { ...i, ticked: true } : i,
  )
}

/** Answer "Who is …?": someone you have (with their changes) or someone new. */
export function resolve(review: Review, ref: string, choice: Resolved): Review {
  let person: PersonItem | undefined
  const rest = review
    .filter((i) => !(i.kind === 'change' && i.ref === ref))
    .map((i) => {
      if (i.kind !== 'person' || i.ref !== ref) return i
      person = { ...i, resolved: choice }
      return person
    })
  const changes =
    person && choice.as === 'existing' && choice.candidate
      ? changesFor(person, choice.candidate)
      : []
  return ordered([...rest, ...changes])
}

/** Change an item's fields as typed on its card. */
export function edit<T extends Item>(review: Review, id: string, changes: Partial<T>): Review {
  return review.map((i) => (i.id === id ? ({ ...i, ...changes } as Item) : i))
}

/** "+ Add something the AI missed": a blank card, ticked, about `about` where it applies. */
export function addItem(review: Review, kind: AddKind, about = ''): Review {
  const id = nextId(review, { person: 'n', connection: 'c', aid: 'm', entry: 'e' }[kind])
  const blank: Record<AddKind, Item> = {
    person: {
      kind: 'person',
      id,
      ref: id,
      name: '',
      how_we_met: '',
      work: '',
      birthday: null,
      tags: [],
      match: 'new',
      candidates: [],
      resolved: { as: 'new' },
      ticked: true,
    },
    connection: {
      kind: 'connection',
      id,
      a: ME,
      b: about,
      type: 'friend',
      label: '',
      parent_type: null,
      ticked: true,
    },
    aid: { kind: 'aid', id, about, text: '', ticked: true },
    entry: {
      kind: 'entry',
      id,
      about,
      entryKind: 'met',
      date: isoDay(),
      label: '',
      note: '',
      ticked: true,
    },
  }
  return ordered([...review, blank[kind]])
}

function nextId(review: Review, prefix: string): string {
  const taken = new Set(review.map((item) => item.id))
  let n = 1
  while (taken.has(`${prefix}${n}`)) n++
  return `${prefix}${n}`
}

/** The refs of ticked people still waiting for "Who is …?". */
export const unresolved = (review: Review) =>
  review
    .filter((i): i is PersonItem => i.kind === 'person' && i.ticked && !i.resolved)
    .map((i) => i.ref)

/** "3 of 7 selected": changes that can't be made don't count. */
export function counts(review: Review) {
  const possible = review.filter((i) => !(i.kind === 'change' && i.disabled))
  return { selected: possible.filter((i) => i.ticked).length, total: possible.length }
}

/** What Save sends: the ticked items, and only those about ticked people. */
export function toSaveBody(review: Review, spaceId: string | null): SaveBody {
  const people = review.filter((i): i is PersonItem => i.kind === 'person' && i.ticked)
  const kept = new Set([ME, ...people.map((p) => p.ref)])
  const ticked = <K extends Item['kind']>(kind: K) =>
    review.filter(
      (i): i is Extract<Item, { kind: K }> =>
        i.kind === kind && i.ticked && refsOf(i).every((ref) => kept.has(ref)),
    )
  const changesOf = (ref: string) =>
    Object.fromEntries(
      ticked('change')
        .filter((c) => c.ref === ref)
        .map((c) => [c.field === 'tags' ? 'add_tags' : c.field, c.value]),
    )

  return {
    space_id: spaceId,
    new_people: people
      .filter((p) => p.resolved?.as === 'new')
      .map(({ ref, name, how_we_met, work, birthday, tags }) => ({
        ref,
        name,
        how_we_met,
        work,
        birthday,
        tags,
      })),
    existing_people: people.flatMap(({ ref, resolved }) =>
      resolved?.as === 'existing' ? [{ ref, person_id: resolved.id, changes: changesOf(ref) }] : [],
    ),
    connections: ticked('connection').map((link) => ({
      a: link.a,
      b: link.b,
      type: link.type,
      label: link.label,
      parent_type: link.parent_type,
      // What its card says: the server refuses it unless both people are in the space.
      in_space: spaceId !== null && inChosenSpace(review, link),
    })),
    memory_aids: ticked('aid').map(({ about, text }) => ({ about, text })),
    entries: ticked('entry').map(({ about, entryKind, date, label, note }) => ({
      about,
      kind: entryKind,
      date,
      label,
      note,
    })),
  }
}

type Counts = { people: number; connections: number; memory_aids: number; entries: number }

/** "1 person, 1 connection and 2 timeline entries", leaving out what's 0. */
function countWords(counts: Counts, changes: number): string {
  return words([
    counts.people > 0 && countOf(counts.people, 'person', 'people'),
    counts.connections > 0 && countOf(counts.connections, 'connection'),
    counts.memory_aids > 0 && countOf(counts.memory_aids, 'memory aid'),
    counts.entries > 0 && countOf(counts.entries, 'timeline entry', 'timeline entries'),
    changes > 0 && countOf(changes, 'detail'),
  ])
}

/**
 * "Added 1 person, 1 connection and 1 memory aid.", "Emma matched to someone you already
 * had.", "Updated 1 detail."
 */
export function summary({ added, matched }: Saved): string[] {
  const parts = countWords(added, 0)
  const lines = parts ? [`Added ${parts}.`] : []
  if (matched.length) {
    const who = words(matched.map(firstNameOf))
    lines.push(`${who} matched to ${matched.length === 1 ? 'someone' : 'people'} you already had.`)
  }
  if (added.changes > 0) lines.push(`Updated ${countOf(added.changes, 'detail')}.`)
  return lines
}

/** The toast after Undo: "Undone: 1 person and 1 detail". */
export const undoneTitle = ({ removed, restored }: Undone) =>
  `Undone: ${countWords(removed, restored) || 'nothing was left to take back'}`

/**
 * Whether a link goes into the chosen space: when both its people are in it (you are,
 * and so is everyone new). The server decides the same way when saving.
 */
export function inChosenSpace(review: Review, link: ConnectionItem): boolean {
  return [link.a, link.b].every((ref) => {
    if (ref === ME) return true
    const person = review.find((i): i is PersonItem => i.kind === 'person' && i.ref === ref)
    if (person?.resolved?.as === 'new') return true
    return person?.resolved?.as === 'existing' && Boolean(person.resolved.candidate?.in_space)
  })
}
