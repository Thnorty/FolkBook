import { describe, expect, it } from 'vitest'
import { linkLabel } from '@/features/person/labels'
import { alsoVia, routeTitle, stepLabel, whyLine, type Route, type Step } from './route'

const ME = { id: 'me', name: 'Ela Yılmaz' }
const EMMA = { id: 'emma', name: 'Emma Yılmaz' }
const TOM = { id: 'tom', name: 'Tom Bergqvist' }
const HACKATHON = { id: 'h', name: 'Hackathon 2026', color: 'ochre' } as const
const CLIMBING = { id: 'c', name: 'Climbing club', color: 'teal' } as const

function step(kind: Step['kind'], extra: Partial<Step> = {}): Step {
  return {
    source: ME,
    target: TOM,
    kind,
    type: null,
    label: '',
    former: false,
    space: null,
    ...extra,
  }
}

type WhyPerson = Parameters<typeof whyLine>[0]

function person(extra: Partial<WhyPerson> = {}): WhyPerson {
  return {
    id: 'tom',
    name: 'Tom Bergqvist',
    is_me: false,
    is_mine: false,
    owner: { id: 'defne', name: 'Defne Aydın' },
    spaces: [HACKATHON],
    ...extra,
  }
}

describe('stepLabel', () => {
  it('words a step like the line it went along', () => {
    expect(stepLabel(step('relationship', { type: 'friend' }))).toBe('friend')
    expect(stepLabel(step('relationship', { type: 'partner', former: true }))).toBe(
      'former partner',
    )
    expect(stepLabel(step('relationship', { type: 'met_at', label: 'Hackathon 2026' }))).toBe(
      linkLabel({ type: 'met_at', label: 'Hackathon 2026' }),
    )
    expect(stepLabel(step('member', { space: HACKATHON }))).toBe('shares Hackathon 2026')
    expect(stepLabel(step('space', { space: HACKATHON }))).toBe('in Hackathon 2026')
  })
})

describe('routeTitle', () => {
  it('counts the steps, with the first name', () => {
    expect(routeTitle('Tom Bergqvist', 2)).toBe('How you know Tom · 2 steps')
    expect(routeTitle('Tom Bergqvist', 1)).toBe('How you know Tom · 1 step')
  })
})

describe('alsoVia', () => {
  it('names the first person on the way and the steps', () => {
    const route: Route = {
      hops: [
        step('relationship', { target: EMMA, type: 'friend' }),
        step('relationship', { source: EMMA, type: 'cousin' }),
      ],
    }
    expect(alsoVia(route)).toBe('Also via Emma Yılmaz: friend, then cousin')
    expect(alsoVia({ hops: [step('relationship', { target: EMMA, type: 'friend' })] })).toBe(
      'Also via Emma Yılmaz: friend',
    )
  })
})

describe('whyLine', () => {
  it('says whose book someone came from, and with which spaces', () => {
    expect(whyLine(person())).toBe('Tom came into your book with Hackathon 2026, shared by Defne.')
    expect(whyLine(person({ spaces: [HACKATHON, CLIMBING] }))).toBe(
      'Tom came into your book with Hackathon 2026 and Climbing club, shared by Defne.',
    )
    expect(whyLine(person({ spaces: [] }))).toBe('Tom came into your book through Defne.')
  })

  it('says nothing for your own people, your Me, or another user’s Me', () => {
    expect(whyLine(person({ is_mine: true, owner: null }))).toBeNull()
    expect(whyLine(person({ is_me: true }))).toBeNull()
    expect(whyLine(person({ id: 'defne', name: 'Defne Aydın' }))).toBeNull()
  })
})
