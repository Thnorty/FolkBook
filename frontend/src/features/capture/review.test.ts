import { describe, expect, it } from 'vitest'
import { formatBirthday } from '@/lib/dates'
import type { Candidate, Draft, Saved } from './queries'
import {
  addItem,
  changesFor,
  counts,
  edit,
  fromDraft,
  resolve,
  summary,
  toSaveBody,
  toggle,
  unresolved,
  inChosenSpace,
  undoneTitle,
  type ConnectionItem,
  type PersonItem,
} from './review'

const candidate = (fields: Partial<Candidate> = {}): Candidate => ({
  id: 'emma-id',
  name: 'Emma Yılmaz',
  detail: 'Climbing club',
  owner: { id: 'ela-me', name: 'Ela Kaya' },
  current: { how_we_met: '', work: 'Google', birthday: null, tags: ['family'] },
  can_edit: true,
  can_tag: true,
  in_space: false,
  ...fields,
})

const draft = (): Draft => ({
  people: [
    {
      ref: 't',
      name: 'Tom',
      how_we_met: 'At the hackathon',
      work: 'Designer at Spotify',
      birthday: null,
      tags: ['climbing'],
      match: 'new',
      candidates: [],
    },
    {
      ref: 'e',
      name: 'Emma',
      how_we_met: null,
      work: 'Spotify',
      birthday: { day: 3, month: 4, year: null },
      tags: ['family', 'climbing'],
      match: 'choose',
      candidates: [candidate(), candidate({ id: 'berg-id', name: 'Emma Berg' })],
    },
    {
      ref: 'o',
      name: 'Oskar',
      how_we_met: null,
      work: null,
      birthday: null,
      tags: [],
      match: 'match',
      candidates: [candidate({ id: 'oskar-id', name: 'Oskar' })],
    },
  ],
  connections: [
    { id: 'c1', a: 't', b: 'e', type: 'cousin', label: '', parent_type: null },
    { id: 'c2', a: 'me', b: 't', type: 'friend', label: '', parent_type: null },
  ],
  memory_aids: [{ id: 'm1', about: 't', text: 'Likes climbing' }],
  entries: [{ id: 'e1', about: 'e', kind: 'met', date: '2026-10-10', label: 'Coffee', note: '' }],
})

const ids = (review: ReturnType<typeof fromDraft>, ticked = true) =>
  review.filter((item) => item.ticked === ticked).map((item) => item.id)

const person = (review: ReturnType<typeof fromDraft>, ref: string) =>
  review.find((item): item is PersonItem => item.kind === 'person' && item.ref === ref)!

describe('fromDraft', () => {
  it('ticks everything, resolves match and new, and leaves choose to the user', () => {
    const review = fromDraft(draft())

    expect(ids(review)).toEqual(['t', 'e', 'o', 'c1', 'c2', 'm1', 'e1'])
    expect(person(review, 't').resolved).toEqual({ as: 'new' })
    expect(person(review, 'e').resolved).toBeNull()
    expect(person(review, 'o').resolved).toMatchObject({ as: 'existing', id: 'oskar-id' })
    expect(unresolved(review)).toEqual(['e'])
  })
})

describe('changesFor', () => {
  const emma = () => person(fromDraft(draft()), 'e')

  it('offers what the AI read that differs from what they have', () => {
    const changes = changesFor(emma(), candidate())

    expect(changes.map(({ field, from, to }) => [field, from, to])).toEqual([
      ['work', 'Google', 'Spotify'],
      ['birthday', '', formatBirthday({ day: 3, month: 4 })],
      ['tags', '', 'climbing'],
    ])
    expect(changes.every((change) => change.ticked && !change.disabled)).toBe(true)
  })

  it('offers nothing the AI left empty, or that they already have', () => {
    const same = candidate({
      current: {
        how_we_met: '',
        work: 'Spotify',
        birthday: { day: 3, month: 4, year: null },
        tags: ['Family', 'climbing'],
      },
    })

    expect(changesFor(emma(), same)).toEqual([])
  })

  it('greys out what you may not change, with the reason', () => {
    const changes = changesFor(emma(), candidate({ can_edit: false, can_tag: false }))

    expect(changes.map((change) => [change.ticked, change.disabled])).toEqual([
      [false, "Ela's person: you can't change their details."],
      [false, "Ela's person: you can't change their details."],
      [false, "Ela's person: you can't change their details."],
    ])
  })
})

describe('toggle', () => {
  it('unticks everything about a person, and ticks back only the person', () => {
    let review = fromDraft(draft())
    review = resolve(review, 'e', {
      as: 'existing',
      id: 'emma-id',
      name: 'Emma Yılmaz',
      candidate: candidate(),
    })

    review = toggle(review, 't')

    expect(ids(review, false)).toEqual(['t', 'c1', 'c2', 'm1'])

    review = toggle(review, 't')

    expect(ids(review, false)).toEqual(['c1', 'c2', 'm1'])
  })

  it('ticks the people an item is about along with it', () => {
    let review = toggle(fromDraft(draft()), 't')

    review = toggle(review, 'm1')

    expect(ids(review, false)).toEqual(['c1', 'c2'])
  })

  it('never ticks a change that can’t be made', () => {
    let review = fromDraft(draft())
    const viewer = candidate({ can_edit: false, can_tag: false })
    review = resolve(review, 'e', {
      as: 'existing',
      id: 'emma-id',
      name: 'Emma',
      candidate: viewer,
    })

    review = toggle(review, 'e:work')

    expect(review.find((item) => item.id === 'e:work')?.ticked).toBe(false)
  })
})

describe('resolve', () => {
  it('adds the changes for an existing person, and removes them for someone new', () => {
    let review = resolve(fromDraft(draft()), 'e', {
      as: 'existing',
      id: 'emma-id',
      name: 'Emma Yılmaz',
      candidate: candidate(),
    })

    expect(ids(review)).toEqual([
      't',
      'e',
      'o',
      'e:work',
      'e:birthday',
      'e:tags',
      'c1',
      'c2',
      'm1',
      'e1',
    ])
    expect(unresolved(review)).toEqual([])

    review = resolve(review, 'e', { as: 'new' })

    expect(ids(review)).toEqual(['t', 'e', 'o', 'c1', 'c2', 'm1', 'e1'])
  })

  it('offers no changes for someone picked by search', () => {
    const review = resolve(fromDraft(draft()), 'e', {
      as: 'existing',
      id: 'other-id',
      name: 'Emma Other',
      candidate: null,
    })

    expect(review.some((item) => item.kind === 'change')).toBe(false)
  })
})

describe('counts', () => {
  it('counts what is ticked out of what could be', () => {
    const review = toggle(fromDraft(draft()), 't')

    expect(counts(review)).toEqual({ selected: 3, total: 7 })
  })
})

describe('toSaveBody', () => {
  it('sends ticked people as new or existing, with only the ticked changes', () => {
    let review = resolve(fromDraft(draft()), 'e', {
      as: 'existing',
      id: 'emma-id',
      name: 'Emma Yılmaz',
      candidate: candidate(),
    })
    review = toggle(review, 'e:birthday')
    review = toggle(review, 'c2')
    review = edit(review, 'm1', { text: 'Climbs on Tuesdays' })

    expect(toSaveBody(review, 'climbing-id')).toEqual({
      space_id: 'climbing-id',
      new_people: [
        {
          ref: 't',
          name: 'Tom',
          how_we_met: 'At the hackathon',
          work: 'Designer at Spotify',
          birthday: null,
          tags: ['climbing'],
        },
      ],
      existing_people: [
        { ref: 'e', person_id: 'emma-id', changes: { work: 'Spotify', add_tags: ['climbing'] } },
        { ref: 'o', person_id: 'oskar-id', changes: {} },
      ],
      connections: [{ a: 't', b: 'e', type: 'cousin', label: '', parent_type: null }],
      memory_aids: [{ about: 't', text: 'Climbs on Tuesdays' }],
      entries: [{ about: 'e', kind: 'met', date: '2026-10-10', label: 'Coffee', note: '' }],
    })
  })

  it('leaves out everything about someone unticked', () => {
    const review = toggle(resolve(fromDraft(draft()), 'e', { as: 'new' }), 't')

    const body = toSaveBody(review, null)

    expect(body.new_people?.map((p) => p.ref)).toEqual(['e'])
    expect(body.connections).toEqual([])
    expect(body.memory_aids).toEqual([])
    expect(body.space_id).toBeNull()
  })
})

describe('addItem', () => {
  it('adds what the AI missed, ticked, with an id of its own', () => {
    let review = fromDraft(draft())

    review = addItem(review, 'aid', 't')
    review = addItem(review, 'aid', 't')
    review = addItem(review, 'person')

    const added = review.filter((item) => ['m2', 'm3', 'n1'].includes(item.id))
    expect(added.map((item) => [item.id, item.kind, item.ticked])).toEqual([
      ['n1', 'person', true],
      ['m2', 'aid', true],
      ['m3', 'aid', true],
    ])
    expect(person(review, 'n1').resolved).toEqual({ as: 'new' })
  })
})

describe('summary', () => {
  const saved = (added: Partial<Saved['added']>, matched: string[] = []): Saved => ({
    capture_id: 'capture-id',
    added: { people: 0, connections: 0, memory_aids: 0, entries: 0, changes: 0, ...added },
    matched,
    people: [],
  })

  it('says what was added and who was matched', () => {
    expect(summary(saved({ people: 1, connections: 1, memory_aids: 1 }, ['Emma Yılmaz']))).toEqual([
      'Added 1 person, 1 connection and 1 memory aid.',
      'Emma matched to someone you already had.',
    ])
  })

  it('counts in plurals', () => {
    expect(summary(saved({ people: 2, memory_aids: 3, entries: 2, changes: 1 }))).toEqual([
      'Added 2 people, 3 memory aids and 2 timeline entries.',
      'Updated 1 detail.',
    ])
    expect(summary(saved({ changes: 2 }, ['Emma Yılmaz']))).toEqual([
      'Emma matched to someone you already had.',
      'Updated 2 details.',
    ])
    expect(summary(saved({ entries: 1 }, ['Emma Yılmaz', 'Oskar']))).toEqual([
      'Added 1 timeline entry.',
      'Emma and Oskar matched to people you already had.',
    ])
  })
})

describe('inChosenSpace', () => {
  it('puts a link in the space when both people are in it', () => {
    let review = fromDraft(draft())
    review = resolve(review, 'e', {
      as: 'existing',
      id: 'emma-id',
      name: 'Emma',
      candidate: candidate(),
    })
    const link = (id: string) => review.find((item) => item.id === id) as ConnectionItem

    // Tom is new, so he goes into the space; Emma isn't in it; you always are.
    expect(inChosenSpace(review, link('c1'))).toBe(false)
    expect(inChosenSpace(review, link('c2'))).toBe(true)

    review = resolve(review, 'e', {
      as: 'existing',
      id: 'emma-id',
      name: 'Emma',
      candidate: candidate({ in_space: true }),
    })
    expect(inChosenSpace(review, link('c1'))).toBe(true)
  })
})

describe('undoneTitle', () => {
  it('says what was taken back', () => {
    expect(
      undoneTitle({
        removed: { people: 1, connections: 1, memory_aids: 1, entries: 0 },
        restored: 1,
      }),
    ).toBe('Undone: 1 person, 1 connection, 1 memory aid and 1 change')
    expect(
      undoneTitle({
        removed: { people: 0, connections: 0, memory_aids: 0, entries: 2 },
        restored: 0,
      }),
    ).toBe('Undone: 2 timeline entries')
  })
})
