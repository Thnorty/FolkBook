import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'
import { LineCurve3, Mesh, TubeGeometry, Vector3 } from 'three'
import { nearestLine } from './lineReach'
import {
  NO_FILTERS,
  toCanvas,
  type GraphData,
  type Palette,
  labelLinesOf,
  linesAround,
  graphSummary,
  routePeople,
  withRoute,
} from './graphModel'
import type { Route } from './route'

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

  it('says what a line means when you tap it', async () => {
    server()
    renderApp('/graph')

    await userEvent.click(await screen.findByRole('button', { name: 'emma–kerem (dashed)' }))
    expect(await lines()).toEqual(['me–emma', 'emma–kerem former partner (dashed)', 'emma–tom'])
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

const palette: Palette = {
  me: 'ink',
  noSpace: 'faint',
  edge: 'line',
  sharedEdge: 'faint line',
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

describe('toCanvas', () => {
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

  it('draws no line for being in a space, and dots between users who share one', () => {
    const graph: GraphData = {
      nodes: GRAPH.nodes,
      edges: [
        edge('s1', 'me', 'emma', '', { kind: 'space', type: null, space: FRIENDS }),
        edge('m1', 'me', 'kerem', '', { kind: 'member', type: null, space: FAMILY }),
      ],
    }
    const { edges } = toCanvas(graph, NO_FILTERS, palette)

    expect(edges).toEqual([
      expect.objectContaining({
        id: 'm1',
        label: 'shares Family',
        dashed: true,
        dashArray: [1, 2],
        fill: 'faint line',
      }),
    ])
    expect(graphSummary(graph).connections).toBe(1)
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
    expect(labelLinesOf(edges, { person: 'emma' }).map((e) => e.label)).toEqual([
      'partner',
      undefined,
    ])
    expect(labelLinesOf(edges, { person: 'kerem' }).map((e) => e.label)).toEqual([
      'partner',
      'parent',
    ])
    expect(labelLinesOf(edges, null).map((e) => e.label)).toEqual([undefined, undefined])
  })

  it('writes on just the line pointed at', () => {
    expect(labelLinesOf(edges, { line: 'e2' }).map((e) => e.label)).toEqual([undefined, 'parent'])
  })
})

describe('linesAround', () => {
  it("lights up a person, their lines and who's at the other end", () => {
    const edges = [
      { id: 'e1', source: 'emma', target: 'kerem', fill: 'line' },
      { id: 'e2', source: 'ayse', target: 'kerem', fill: 'line' },
    ]
    expect(linesAround(edges, { person: 'emma' })).toEqual(['emma', 'kerem', 'e1'])
    expect(linesAround(edges, null)).toEqual([])
  })

  it('lights up a line and the two people it joins', () => {
    const edges = [{ id: 'e2', source: 'ayse', target: 'kerem', fill: 'line' }]
    expect(linesAround(edges, { line: 'e2' })).toEqual(['ayse', 'kerem', 'e2'])
  })
})

describe('nearestLine', () => {
  // Two tubes like Reagraph's lines: along y = 0 and y = 10, from x = 0 to 100.
  const tube = (y: number) =>
    new Mesh(
      new TubeGeometry(
        new LineCurve3(new Vector3(0, y, 0), new Vector3(100, y, 0)),
        20,
        0.5,
        5,
        false,
      ),
    )
  const [low, high] = [tube(0), tube(10)]

  it('finds a line from a few units away, the nearest one first', () => {
    expect(nearestLine([low, high], new Vector3(50, 3, 0), 4)).toBe(low)
    expect(nearestLine([low, high], new Vector3(50, 7, 0), 4)).toBe(high)
  })

  it('finds nothing out of reach or past the ends', () => {
    expect(nearestLine([low, high], new Vector3(50, 5, 0), 4)).toBeNull()
    expect(nearestLine([low, high], new Vector3(110, 0, 0), 4)).toBeNull()
  })
})

describe('the route on the canvas', () => {
  const ME_REF = { id: 'me', name: 'Ela' }
  const EMMA = { id: 'emma', name: 'Emma Yılmaz' }
  const KEREM = { id: 'kerem', name: 'Kerem Yılmaz' }
  const TOM = { id: 'tom', name: 'Tom Bergqvist' }
  const DEFNE = { id: 'defne', name: 'Defne Aydın' }
  const HACKATHON = { id: 'h', name: 'Hackathon 2026', color: 'ochre' as const }
  type Step = Route['hops'][number]
  const step = (id: string, source: Step['source'], target: Step['target'], extra = {}): Step => ({
    id,
    source,
    target,
    kind: 'relationship',
    type: 'friend',
    label: '',
    former: false,
    space: null,
    ...extra,
  })
  // Me →friend→ Emma →cousin→ Tom
  const ROUTE: Route = {
    hops: [step('e1', ME_REF, EMMA), step('e3', EMMA, TOM, { type: 'cousin' })],
  }

  it('inks the lines the route takes and lights up its people', () => {
    const drawn = withRoute(toCanvas(GRAPH, NO_FILTERS, palette), ROUTE, 2, palette)

    const byId = Object.fromEntries(drawn.edges.map((e) => [e.id, e]))
    expect(byId.e1).toMatchObject({ ink: true, size: 3, label: 'friend' })
    expect(byId.e3).toMatchObject({ ink: true, size: 3, label: 'cousin' })
    expect(byId.e2.ink).toBeUndefined()
    expect(byId.e2.size).toBeUndefined()
    expect(drawn.route).toEqual(['me', 'emma', 'tom', 'e1', 'e3'])
  })

  it('adds a line for a step through someone’s space', () => {
    const graph: GraphData = {
      nodes: [...GRAPH.nodes, node('defne', 'Defne Aydın', [HACKATHON])],
      edges: [
        edge('member:h:defne', 'me', 'defne', '', { kind: 'member', type: null, space: HACKATHON }),
      ],
    }
    const route: Route = {
      hops: [
        step('member:h:defne', ME_REF, DEFNE, { kind: 'member', type: null, space: HACKATHON }),
        step('space:h:tom', DEFNE, TOM, { kind: 'space', type: null, space: HACKATHON }),
      ],
    }

    const { edges } = withRoute(toCanvas(graph, NO_FILTERS, palette), route, 2, palette)

    expect(edges.find((e) => e.id === 'member:h:defne')).toMatchObject({ ink: true })
    expect(edges.find((e) => e.id === 'route:1')).toMatchObject({
      source: 'defne',
      target: 'tom',
      label: 'in Hackathon 2026',
      ink: true,
    })
  })

  it('inks the line the step used when two people have two', () => {
    const graph: GraphData = {
      nodes: [...GRAPH.nodes, node('defne', 'Defne Aydın', [HACKATHON])],
      edges: [
        edge('relationship:r1', 'me', 'defne', 'friend'),
        edge('member:h:me', 'me', 'defne', '', { kind: 'member', type: null, space: HACKATHON }),
      ],
    }
    const route: Route = { hops: [step('relationship:r1', ME_REF, DEFNE)] }

    const { edges } = withRoute(toCanvas(graph, NO_FILTERS, palette), route, 1, palette)

    expect(edges.filter((e) => e.ink).map((e) => e.id)).toEqual(['relationship:r1'])
  })

  it('draws only the steps reached so far', () => {
    const drawn = withRoute(toCanvas(GRAPH, NO_FILTERS, palette), ROUTE, 1, palette)

    expect(drawn.edges.filter((e) => e.ink).map((e) => e.id)).toEqual(['e1'])
    expect(drawn.route).toEqual(['me', 'emma', 'e1'])
  })

  it('never hides the route behind a filter', () => {
    const keep = new Set(routePeople(ROUTE))
    const { nodes } = toCanvas(GRAPH, { ...NO_FILTERS, spaces: [FAMILY.id] }, palette, {}, keep)
    expect(nodes.map((n) => n.id)).toEqual(expect.arrayContaining(['emma', 'tom']))

    const former: Route = {
      hops: [step('e1', ME_REF, EMMA), step('e2', EMMA, KEREM, { type: 'partner', former: true })],
    }
    const hidden = toCanvas(
      GRAPH,
      { ...NO_FILTERS, hideFormer: true },
      palette,
      {},
      new Set(routePeople(former)),
    )
    const { edges } = withRoute(hidden, former, 2, palette)
    expect(edges.find((e) => e.id === 'route:1')).toMatchObject({
      source: 'emma',
      target: 'kerem',
      label: 'former partner',
      ink: true,
    })
  })

  it('keeps the words on ink lines', () => {
    const { edges } = withRoute(toCanvas(GRAPH, NO_FILTERS, palette), ROUTE, 2, palette)

    expect(
      labelLinesOf(edges, null)
        .filter((e) => e.label)
        .map((e) => e.label),
    ).toEqual(['friend', 'cousin'])
  })
})
