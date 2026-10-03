import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'
import { initials } from './faces'
import {
  NO_FILTERS,
  toCanvas,
  type GraphData,
  type Palette,
  labelLinesOf,
  linesAround,
} from './graphModel'

const ME = { id: 'u1', email: 'ela@example.com', is_admin: false, me: { id: 'me', name: 'Ela' } }
const FRIENDS = { id: 's1', name: 'Friends', color: 'sage' as const }
const FAMILY = { id: 's2', name: 'Family', color: 'clay' as const }

const node = (
  id: string,
  name: string,
  spaces: GraphData['nodes'][number]['spaces'] = [FRIENDS],
  isMe = false,
) => ({
  id,
  name,
  is_me: isMe,
  spaces,
  photo_url: null,
})
const edge = (id: string, source: string, target: string, type: string, extra = {}) => ({
  id,
  source,
  target,
  kind: 'relationship' as const,
  type,
  label: '',
  former: false,
  space: null,
  ...extra,
})

const GRAPH: GraphData = {
  nodes: [
    node('me', 'Ela', [], true),
    node('emma', 'Emma Yılmaz', [FRIENDS]),
    node('kerem', 'Kerem Yılmaz', [FAMILY]),
    node('tom', 'Tom Bergqvist', [FRIENDS]),
  ],
  edges: [
    edge('e1', 'me', 'emma', 'friend'),
    edge('e2', 'emma', 'kerem', 'partner', { former: true }),
    edge('e3', 'emma', 'tom', 'cousin'),
  ],
}

function server(graph: GraphData = GRAPH) {
  fakeServer({
    'GET /api/auth/me': () => json(ME),
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/spaces': () => json({ items: [], count: 0 }),
    'GET /api/people': () => json({ items: [], count: 0 }),
    'GET /api/graph': () => json(graph),
    'GET /api/graph/neighborhood/tom': () =>
      json({ nodes: [GRAPH.nodes[1], GRAPH.nodes[3]], edges: [GRAPH.edges[2]] }),
    'GET /api/people/emma': () =>
      json({
        ...node('emma', 'Emma Yılmaz'),
        how_we_met: 'Met at university',
        work: '',
        birthday: null,
        tags: [],
        photo: null,
        is_mine: true,
        owner: { id: 'me', name: 'Ela' },
        needs_details: false,
        last_talked_on: null,
        added_at: '2026-01-01T00:00:00Z',
        pronouns: null,
        contact_methods: [],
        can_edit: true,
        can_delete: true,
        can_hide: false,
      }),
    'GET /api/memory-aids': () =>
      json({
        items: [{ id: 'a1', person_id: 'emma', text: 'Kid: Arda, 6', pinned: false, position: 0 }],
        count: 1,
      }),
  })
}

const lines = async () =>
  within(await screen.findByRole('list', { name: 'Lines' }))
    .queryAllByRole('listitem')
    .map((item) => item.textContent)

afterEach(clearCookies)

describe('graph', () => {
  it('draws everyone with you in the middle, and words on the picked person’s lines', async () => {
    server()
    renderApp('/graph')

    expect(await screen.findByRole('button', { name: 'Me' })).toBeInTheDocument()
    expect(screen.getByText('3 people · 3 connections')).toBeInTheDocument()
    expect(await lines()).toEqual(['me–emma', 'emma–kerem (dashed)', 'emma–tom'])

    await userEvent.click(screen.getByRole('button', { name: 'Tom Bergqvist' }))
    expect(await lines()).toEqual(['me–emma', 'emma–kerem (dashed)', 'emma–tom cousin'])
  })

  it('filters by space, family only and hiding former links', async () => {
    server()
    renderApp('/graph')
    const filters = await screen.findByRole('group', { name: 'Filters' })

    await userEvent.click(within(filters).getByRole('button', { name: 'Hide former' }))
    expect(await lines()).toEqual(['me–emma', 'emma–tom'])

    await userEvent.click(within(filters).getByRole('button', { name: 'Family only' }))
    expect(await lines()).toEqual(['emma–tom'])
    expect(screen.queryByRole('button', { name: 'Kerem Yılmaz' })).not.toBeInTheDocument()

    await userEvent.click(within(filters).getByRole('button', { name: 'Family only' }))
    await userEvent.click(within(filters).getByRole('button', { name: 'Hide former' }))
    await userEvent.click(within(filters).getByRole('button', { name: 'Family' }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Emma Yılmaz' })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'Kerem Yılmaz' })).toBeInTheDocument()
  })

  it('previews a person on click, and focuses from the sheet, not on a double-click', async () => {
    server()
    renderApp('/graph')

    await userEvent.click(await screen.findByRole('button', { name: 'Emma Yılmaz' }))
    const sheet = await screen.findByRole('region', { name: 'Emma Yılmaz, preview' })
    expect(await within(sheet).findByText('Kid: Arda, 6')).toBeInTheDocument()
    expect(within(sheet).getByRole('link', { name: 'Open profile' })).toHaveAttribute(
      'href',
      '/people/emma',
    )
    expect(screen.getByRole('complementary', { name: 'Peek' })).toBeInTheDocument() // desktop

    fireEvent.doubleClick(screen.getByRole('button', { name: 'Tom Bergqvist' }))
    expect(screen.queryByText(/Focused on/)).not.toBeInTheDocument()

    await userEvent.click(within(sheet).getByRole('button', { name: 'Focus' }))
    expect(await screen.findByText(/Focused on Emma Yılmaz/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show everyone' }))
    expect(await lines()).toHaveLength(3)
  })

  it('explains how to read it only when asked', async () => {
    server()
    renderApp('/graph')
    const button = await screen.findByRole('button', { name: 'How to read the graph' })
    expect(screen.queryByText(/Each circle is a person/)).not.toBeInTheDocument()

    await userEvent.click(button)
    expect(screen.getByText(/Each circle is a person/)).toBeInTheDocument()
    expect(button).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(button)
    expect(screen.queryByText(/Each circle is a person/)).not.toBeInTheDocument()
  })

  it('starts with just you', async () => {
    server({ nodes: [node('me', 'Ela', [], true)], edges: [] })
    renderApp('/graph')

    expect(
      await screen.findByRole('heading', { name: 'Your graph starts with you' }),
    ).toBeInTheDocument()
  })
})

describe('toCanvas', () => {
  const palette: Palette = {
    me: 'ink',
    noSpace: 'faint',
    edge: 'line',
    spaceEdge: 'faint line',
    space: { sage: 'green', ochre: 'o', clay: 'red', plum: 'p', teal: 't', slate: 's' },
    spaceInk: {
      sage: 'dark green',
      ochre: 'o',
      clay: 'dark red',
      plum: 'p',
      teal: 't',
      slate: 's',
    },
  }

  it('colors people by their first space and pins you in the middle', () => {
    const { nodes } = toCanvas(GRAPH, NO_FILTERS, palette)

    expect(nodes.find((n) => n.id === 'me')).toMatchObject({
      label: 'Me',
      fill: 'ink',
      fx: 0,
      fy: 0,
    })
    expect(nodes.find((n) => n.id === 'kerem')).toMatchObject({
      fill: 'red',
      data: { cluster: 'Family' },
    })
  })

  it("gives each space's ring the space's colors", () => {
    const { clusters } = toCanvas(GRAPH, NO_FILTERS, palette)

    expect(clusters).toMatchObject({ Family: { ring: 'red', label: 'dark red' } })
  })

  it('keeps you even when a space filter leaves you out', () => {
    const { nodes } = toCanvas(GRAPH, { ...NO_FILTERS, spaces: ['s2'] }, palette)

    expect(nodes.map((n) => n.id)).toEqual(['me', 'kerem'])
  })
})

describe('labelLinesOf', () => {
  const edges = [
    { id: 'e1', source: 'emma', target: 'kerem', label: 'partner', fill: 'line' },
    { id: 'e2', source: 'ayse', target: 'kerem', label: 'parent', fill: 'line' },
  ]

  it("writes the relationship only on the focused person's lines", () => {
    expect(labelLinesOf(edges, 'emma').map((e) => e.label)).toEqual(['partner', undefined])
    expect(labelLinesOf(edges, 'kerem').map((e) => e.label)).toEqual(['partner', 'parent'])
    expect(labelLinesOf(edges, null).map((e) => e.label)).toEqual([undefined, undefined])
  })
})

describe('linesAround', () => {
  it("lights up a person, their lines and who's at the other end", () => {
    const edges = [
      { id: 'e1', source: 'emma', target: 'kerem', fill: 'line' },
      { id: 'e2', source: 'ayse', target: 'kerem', fill: 'line' },
    ]
    expect(linesAround(edges, 'emma')).toEqual(['emma', 'kerem', 'e1'])
    expect(linesAround(edges, null)).toEqual([])
  })
})

describe('initials', () => {
  it('takes the first and last names, in any script case', () => {
    expect(initials('Emma Yılmaz')).toBe('EY')
    expect(initials('Ela')).toBe('E')
    expect(initials('şükrü öztürk')).toBe('ŞÖ')
    expect(initials('Anna Maria van der Berg')).toBe('AB')
  })
})
