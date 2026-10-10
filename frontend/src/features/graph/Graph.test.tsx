import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'
import {
  LineCurve3,
  Mesh,
  PerspectiveCamera,
  Raycaster,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { PERSON_GONE } from './copy'
import { nearestLine, trackPointer, widenLineReach } from './lineReach'
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

const detail = (id: string, name: string, extra = {}) => ({
  ...node(id, name),
  how_we_met: '',
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
  ...extra,
})

type Routes = Parameters<typeof fakeServer>[0]

function server(graph: GraphData = GRAPH, more: Routes = {}) {
  fakeServer({
    'GET /api/auth/me': () => json(ME),
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/spaces': () => json({ items: [], count: 0 }),
    'GET /api/people': () => json({ items: [], count: 0 }),
    'GET /api/graph': () => json(graph),
    'GET /api/graph/neighborhood/tom': () =>
      json({ nodes: [GRAPH.nodes[1], GRAPH.nodes[3]], edges: [GRAPH.edges[2]] }),
    'GET /api/graph/neighborhood/emma': () =>
      json({ nodes: [GRAPH.nodes[0], GRAPH.nodes[1]], edges: [GRAPH.edges[0]] }),
    'GET /api/people/emma': () =>
      json(detail('emma', 'Emma Yılmaz', { how_we_met: 'Met at university' })),
    'GET /api/memory-aids': () =>
      json({
        items: [{ id: 'a1', person_id: 'emma', text: 'Kid: Arda, 6', pinned: false, position: 0 }],
        count: 1,
      }),
    ...more,
  })
}

const lines = async () =>
  within(await screen.findByRole('list', { name: 'Lines' }))
    .queryAllByRole('listitem')
    .map((item) => item.textContent)

afterEach(clearCookies)
// The page is loaded lazily (Reagraph is big): load it once up front, so no test spends
// its waiting time on that.
beforeAll(() => import('./GraphPage'))

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
    await userEvent.click(screen.getByRole('button', { name: 'Back to everyone' }))
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

describe('how do I know…?', () => {
  const HACKATHON = { id: 'h', name: 'Hackathon 2026', color: 'ochre' as const }
  // Two ways to Tom: through Emma (the shortest), or through Kerem. Anna has no links.
  const ROUTES_GRAPH: GraphData = {
    nodes: [...GRAPH.nodes, node('anna', 'Anna Berg', [])],
    edges: [
      ...GRAPH.edges,
      edge('e4', 'me', 'kerem', 'friend'),
      edge('e5', 'kerem', 'tom', 'friend'),
    ],
  }
  const ref = (id: string, name: string) => ({ id, name })
  const step = (id: string, from: [string, string], to: [string, string], type: string) => ({
    id,
    source: ref(...from),
    target: ref(...to),
    kind: 'relationship' as const,
    type,
    label: '',
    former: false,
    space: null,
  })
  const ME_REF: [string, string] = ['me', 'Ela']
  const EMMA: [string, string] = ['emma', 'Emma Yılmaz']
  const KEREM: [string, string] = ['kerem', 'Kerem Yılmaz']
  const TOM: [string, string] = ['tom', 'Tom Bergqvist']
  const VIA_EMMA = { hops: [step('e1', ME_REF, EMMA, 'friend'), step('e3', EMMA, TOM, 'cousin')] }
  const VIA_KEREM = {
    hops: [step('e4', ME_REF, KEREM, 'friend'), step('e5', KEREM, TOM, 'friend')],
  }

  function routes() {
    server(ROUTES_GRAPH, {
      'GET /api/people': (request) =>
        new URL(request.url).searchParams.get('search') === 'Tom'
          ? json({ items: [detail('tom', 'Tom Bergqvist')], count: 1 })
          : json({ items: [], count: 0 }),
      'GET /api/people/me': () => json(detail('me', 'Ela', { is_me: true })),
      'GET /api/people/tom': () =>
        json(
          detail('tom', 'Tom Bergqvist', {
            is_mine: false,
            owner: { id: 'defne', name: 'Defne Aydın' },
            spaces: [HACKATHON],
          }),
        ),
      'GET /api/people/kerem': () => json(detail('kerem', 'Kerem Yılmaz')),
      'GET /api/people/anna': () => json(detail('anna', 'Anna Berg', { spaces: [] })),
      'GET /api/graph/paths/tom': () => json({ paths: [VIA_EMMA, VIA_KEREM] }),
      'GET /api/graph/paths/kerem': () =>
        json({ paths: [{ hops: [step('e4', ME_REF, KEREM, 'friend')] }] }),
      'GET /api/graph/paths/emma': () =>
        json({ paths: [{ hops: [step('e1', ME_REF, EMMA, 'friend')] }] }),
      'GET /api/graph/paths/anna': () => json({ paths: [] }),
    })
  }

  const inked = async () => (await lines()).filter((line) => line?.endsWith('(ink)'))
  const summary = (name: string) => screen.findByRole('region', { name: `How you know ${name}` })
  const noSummary = () => expect(screen.queryByRole('region', { name: /How you know/ })).toBeNull()

  it('shows how you know someone you pick', async () => {
    routes()
    const router = renderApp('/graph')

    await userEvent.type(await screen.findByLabelText('How do I know…?'), 'Tom')
    const matches = await screen.findByRole('list', { name: 'People' })
    await userEvent.click(await within(matches).findByRole('button', { name: /Tom Bergqvist/ }))

    const card = await summary('Tom')
    expect(await within(card).findByText('How you know Tom · 2 steps')).toBeInTheDocument()
    expect(within(card).getByRole('list', { name: 'Steps' })).toHaveTextContent(
      /friend.*Emma Yılmaz.*cousin.*Tom Bergqvist/,
    )
    expect(
      within(card).getByText('Tom came into your book with Hackathon 2026, shared by Defne.'),
    ).toBeInTheDocument()
    expect(within(card).getByText('Also via Kerem Yılmaz: friend, then friend')).toBeInTheDocument()
    await waitFor(async () =>
      expect(await inked()).toEqual(['me–emma friend (ink)', 'emma–tom cousin (ink)']),
    )
    expect(router.state.location.search).toEqual({ how: 'tom' })
  })

  it('shows another route, and back', async () => {
    routes()
    renderApp('/graph?how=tom')
    const card = await summary('Tom')

    await userEvent.click(await within(card).findByRole('button', { name: 'Show' }))
    await waitFor(async () =>
      expect(await inked()).toEqual(['me–kerem friend (ink)', 'kerem–tom friend (ink)']),
    )

    await userEvent.click(within(card).getByRole('button', { name: 'Back to the shortest' }))
    await waitFor(async () =>
      expect(await inked()).toEqual(['me–emma friend (ink)', 'emma–tom cousin (ink)']),
    )
  })

  it('clears the route', async () => {
    routes()
    const router = renderApp('/graph?how=tom')

    await userEvent.click(
      await within(await summary('Tom')).findByRole('button', { name: 'Clear' }),
    )
    await waitFor(noSummary)
    expect(await inked()).toEqual([])
    expect(router.state.location.search).toEqual({})

    await router.navigate({ to: '/graph', search: { how: 'tom' } })
    await userEvent.click(await screen.findByRole('button', { name: 'Clear the route' }))
    await waitFor(noSummary)

    await router.navigate({ to: '/graph', search: { how: 'tom' } })
    await summary('Tom')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(router.state.location.search).toEqual({}))
  })

  it('closes the peek before the route on Esc', async () => {
    routes()
    const router = renderApp('/graph?how=tom')
    await summary('Tom')

    await userEvent.click(screen.getByRole('button', { name: 'Emma Yılmaz' }))
    expect(await screen.findByRole('complementary', { name: 'Peek' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Peek' })).toBeNull())
    expect(router.state.location.search).toEqual({ how: 'tom' })

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(router.state.location.search).toEqual({}))
  })

  it('starts from the keyboard', async () => {
    routes()
    renderApp('/graph')
    const box = await screen.findByLabelText('How do I know…?')

    await userEvent.keyboard('/')

    expect(box).toHaveFocus()
  })

  it('says when there is no route', async () => {
    routes()
    renderApp('/graph?how=anna')

    const card = await summary('Anna')
    expect(
      await within(card).findByText("You haven't said how you know Anna yet."),
    ).toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: 'Connect…' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('Anna')
  })

  it('says when the person is gone', async () => {
    routes()
    renderApp('/graph?how=gone')

    expect(await screen.findByText("This person isn't in your book anymore.")).toBeInTheDocument()
    expect(await inked()).toEqual([])
  })

  it('starts from a person’s peek panel and phone sheet', async () => {
    routes()
    const router = renderApp('/graph')

    await userEvent.click(await screen.findByRole('button', { name: 'Emma Yılmaz' }))
    const peek = await screen.findByRole('complementary', { name: 'Peek' })
    await userEvent.click(within(peek).getByRole('button', { name: 'How do I know them?' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ how: 'emma' }))
    expect(await summary('Emma')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Emma Yılmaz' }))
    const sheet = await screen.findByRole('region', { name: 'Emma Yılmaz, preview' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'How do I know them?' }))
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Emma Yılmaz, preview' })).toBeNull(),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Me' }))
    await screen.findByRole('region', { name: 'Ela, preview' })
    expect(screen.queryByRole('button', { name: 'How do I know them?' })).toBeNull()
  })

  it('ignores a route to yourself', async () => {
    routes()
    renderApp('/graph?how=me')

    await screen.findByRole('button', { name: 'Me' })
    noSummary()
    expect(await inked()).toEqual([])
  })

  it('shows the route, not focus, when the URL asks for both', async () => {
    routes()
    renderApp('/graph?how=tom&focus=tom')

    expect(await summary('Tom')).toBeInTheDocument()
    expect(screen.queryByText(/Focused on/)).toBeNull()
  })

  it('shows the shortest route of the next person you pick', async () => {
    routes()
    renderApp('/graph?how=tom')
    await userEvent.click(await within(await summary('Tom')).findByRole('button', { name: 'Show' }))

    await userEvent.click(screen.getByRole('button', { name: 'Kerem Yılmaz' }))
    const peek = await screen.findByRole('complementary', { name: 'Peek' })
    await userEvent.click(within(peek).getByRole('button', { name: 'How do I know them?' }))

    const card = await summary('Kerem')
    expect(await within(card).findByText('How you know Kerem · 1 step')).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Back to the shortest' })).toBeNull()
    await waitFor(async () => expect(await inked()).toEqual(['me–kerem friend (ink)']))
  })

  it('starts again from the shortest route after clearing', async () => {
    routes()
    renderApp('/graph?how=tom')
    const card = await summary('Tom')
    await userEvent.click(await within(card).findByRole('button', { name: 'Show' }))
    await userEvent.click(within(card).getByRole('button', { name: 'Clear' }))
    await waitFor(noSummary)

    await userEvent.type(await screen.findByLabelText('How do I know…?'), 'Tom')
    const matches = await screen.findByRole('list', { name: 'People' })
    await userEvent.click(await within(matches).findByRole('button', { name: /Tom Bergqvist/ }))

    const again = await summary('Tom')
    expect(await within(again).findByText('How you know Tom · 2 steps')).toBeInTheDocument()
    expect(within(again).queryByRole('button', { name: 'Back to the shortest' })).toBeNull()
    await waitFor(async () =>
      expect(await inked()).toEqual(['me–emma friend (ink)', 'emma–tom cousin (ink)']),
    )
  })

  it('switches between focus and a route', async () => {
    routes()
    renderApp('/graph')
    const openSheet = async () => {
      await userEvent.click(await screen.findByRole('button', { name: 'Emma Yılmaz' }))
      return screen.findByRole('region', { name: 'Emma Yılmaz, preview' })
    }

    await userEvent.click(within(await openSheet()).getByRole('button', { name: 'Focus' }))
    expect(await screen.findByText(/Focused on Emma Yılmaz/)).toBeInTheDocument()

    await userEvent.click(
      within(await openSheet()).getByRole('button', { name: 'How do I know them?' }),
    )
    expect(await summary('Emma')).toBeInTheDocument()
    expect(screen.queryByText(/Focused on/)).toBeNull()

    await userEvent.click(within(await openSheet()).getByRole('button', { name: 'Focus' }))
    expect(await screen.findByText(/Focused on Emma Yılmaz/)).toBeInTheDocument()
    noSummary()
  })
})

describe('focus mode', () => {
  // Everyone in GRAPH is one step from Emma; Anna isn't connected to anyone, and Ola is
  // two steps away (through Tom), known only to the 2-step neighborhood.
  const FOCUS_GRAPH: GraphData = {
    ...GRAPH,
    nodes: [...GRAPH.nodes, node('anna', 'Anna Berg', [])],
  }
  const TWO_STEPS: GraphData = {
    nodes: [...GRAPH.nodes, node('ola', 'Ola Nordmann')],
    edges: [...GRAPH.edges, edge('e6', 'tom', 'ola', 'friend')],
  }
  const twoSteps = (request: Request) => new URL(request.url).searchParams.get('hops') === '2'

  function focusServer(more: Routes = {}) {
    server(FOCUS_GRAPH, {
      'GET /api/graph/neighborhood/emma': (request) => json(twoSteps(request) ? TWO_STEPS : GRAPH),
      'GET /api/graph/neighborhood/anna': () =>
        json({ nodes: [node('anna', 'Anna Berg', [])], edges: [] }),
      'GET /api/people/kerem': () => json(detail('kerem', 'Kerem Yılmaz')),
      'GET /api/people/tom': () => json(detail('tom', 'Tom Bergqvist')),
      ...more,
    })
  }
  const drawn = (name: string) => screen.queryByRole('button', { name })
  const bar = () => screen.queryByRole('group', { name: 'Focus' })

  it('focuses from the desktop peek, and goes back to everyone', async () => {
    focusServer()
    const router = renderApp('/graph')

    await userEvent.click(await screen.findByRole('button', { name: 'Emma Yılmaz' }))
    const peek = await screen.findByRole('complementary', { name: 'Peek' })
    await userEvent.click(within(peek).getByRole('button', { name: 'Focus' }))

    expect(await screen.findByText('Focused on Emma Yılmaz')).toBeInTheDocument()
    expect(await screen.findByText('3 direct · 1 other hidden')).toBeInTheDocument()
    await waitFor(() => expect(drawn('Anna Berg')).toBeNull())

    await userEvent.click(screen.getByRole('button', { name: 'Back to everyone' }))
    await waitFor(() => expect(bar()).toBeNull())
    expect(router.state.location.search).toEqual({})
    expect(await screen.findByRole('button', { name: 'Anna Berg' })).toBeInTheDocument()
  })

  it('shows 2 steps', async () => {
    focusServer()
    const router = renderApp('/graph?focus=emma')
    const steps = await screen.findByRole('group', { name: 'Steps' })

    await userEvent.click(within(steps).getByRole('button', { name: '2 steps' }))
    expect(await screen.findByRole('button', { name: 'Ola Nordmann' })).toBeInTheDocument()
    expect(router.state.location.search).toEqual({ focus: 'emma', hops: 2 })
    expect(screen.getByText(/· 1 more at 2 steps/)).toBeInTheDocument()

    await userEvent.click(within(steps).getByRole('button', { name: '1 step' }))
    await waitFor(() => expect(drawn('Ola Nordmann')).toBeNull())
    expect(router.state.location.search).toEqual({ focus: 'emma' })
  })

  it('starts a new focus at 1 step', async () => {
    focusServer()
    const router = renderApp('/graph?focus=emma&hops=2')

    await userEvent.click(await screen.findByRole('button', { name: 'Kerem Yılmaz' }))
    const peek = await screen.findByRole('complementary', { name: 'Peek' })
    await userEvent.click(within(peek).getByRole('button', { name: 'Focus' }))

    await waitFor(() => expect(router.state.location.search).toEqual({ focus: 'kerem' }))
  })

  it('keeps the focused person when a filter would hide them', async () => {
    focusServer()
    renderApp('/graph?focus=emma')
    await screen.findByText('Focused on Emma Yılmaz')

    const filters = screen.getByRole('group', { name: 'Filters' })
    await userEvent.click(within(filters).getByRole('button', { name: 'Family' }))

    await waitFor(() => expect(drawn('Tom Bergqvist')).toBeNull()) // the filter applies…
    expect(drawn('Emma Yılmaz')).toBeInTheDocument() // …but not to her
  })

  it('leaves focus on Esc, after closing the peek', async () => {
    focusServer()
    const router = renderApp('/graph?focus=emma')

    await userEvent.click(await screen.findByRole('button', { name: 'Tom Bergqvist' }))
    expect(await screen.findByRole('complementary', { name: 'Peek' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Peek' })).toBeNull())
    expect(router.state.location.search).toEqual({ focus: 'emma' })

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(router.state.location.search).toEqual({}))
  })

  it('keeps the neighborhood drawn while 2 steps load', async () => {
    let answer = () => {}
    const held = new Promise<void>((resolve) => (answer = resolve))
    focusServer({
      'GET /api/graph/neighborhood/emma': async (request) => {
        if (!twoSteps(request)) return json(GRAPH)
        await held
        return json(TWO_STEPS)
      },
    })
    renderApp('/graph?focus=emma')
    const steps = await screen.findByRole('group', { name: 'Steps' })
    await screen.findByText('3 direct · 1 other hidden')

    await userEvent.click(within(steps).getByRole('button', { name: '2 steps' }))
    expect(drawn('Tom Bergqvist')).toBeInTheDocument()
    expect(drawn('Anna Berg')).toBeNull() // not everyone, in between

    answer()
    expect(await screen.findByRole('button', { name: 'Ola Nordmann' })).toBeInTheDocument()
  })

  it('never draws one person’s neighborhood under another’s name', async () => {
    let answer = () => {}
    const held = new Promise<void>((resolve) => (answer = resolve))
    focusServer({
      'GET /api/graph/neighborhood/anna': async () => {
        await held
        return json({ nodes: [node('anna', 'Anna Berg', [])], edges: [] })
      },
    })
    const router = renderApp('/graph?focus=emma')
    await screen.findByText('3 direct · 1 other hidden')
    await userEvent.click(screen.getByRole('button', { name: 'Back to everyone' }))
    await screen.findByRole('button', { name: 'Anna Berg' })

    await router.navigate({ to: '/graph', search: { focus: 'anna' } })
    await screen.findByText('Focused on Anna Berg')
    // While her answer loads, she is drawn (with everyone), never Emma's people alone.
    expect(drawn('Anna Berg')).toBeInTheDocument()

    answer()
    expect(await screen.findByText('Nobody else is connected to Anna yet.')).toBeInTheDocument()
  })

  it('keeps 2 steps when you focus the person already focused', async () => {
    focusServer()
    const router = renderApp('/graph?focus=emma&hops=2')

    await userEvent.click(await screen.findByRole('button', { name: 'Emma Yılmaz' }))
    const peek = await screen.findByRole('complementary', { name: 'Peek' })
    await userEvent.click(within(peek).getByRole('button', { name: 'Focus' }))

    expect(router.state.location.search).toEqual({ focus: 'emma', hops: 2 })
  })

  it('closes the peek of someone no longer drawn', async () => {
    focusServer({ 'GET /api/people/ola': () => json(detail('ola', 'Ola Nordmann')) })
    renderApp('/graph?focus=emma&hops=2')

    await userEvent.click(await screen.findByRole('button', { name: 'Ola Nordmann' }))
    expect(await screen.findByRole('complementary', { name: 'Peek' })).toBeInTheDocument()
    const steps = screen.getByRole('group', { name: 'Steps' })
    await userEvent.click(within(steps).getByRole('button', { name: '1 step' }))

    await waitFor(() => expect(drawn('Ola Nordmann')).toBeNull())
    expect(screen.queryByRole('complementary', { name: 'Peek' })).toBeNull()
  })

  it('says when nobody else is connected', async () => {
    focusServer()
    renderApp('/graph?focus=anna')

    expect(await screen.findByText('Nobody else is connected to Anna yet.')).toBeInTheDocument()
    expect(screen.queryByText(/direct/)).toBeNull()
  })

  it('says when the focused person is gone', async () => {
    focusServer()
    renderApp('/graph?focus=gone')

    expect(await screen.findByText(PERSON_GONE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to everyone' })).toBeInTheDocument()
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

  it('points at nothing until a pointer is really over the graph', () => {
    // Before any pointer event, three.js aims at the middle of the canvas: whatever line
    // ran through it lit up and showed its words, on phones too.
    const camera = new PerspectiveCamera(50, 1, 0.1, 1000)
    camera.position.set(50, 0, 100)
    camera.updateMatrixWorld()
    const raycaster = new Raycaster()
    raycaster.setFromCamera(new Vector2(0, 0), camera)
    let pointing = false
    widenLineReach(
      raycaster,
      () => ({ camera, heightPx: 100 }),
      () => pointing,
    )

    expect(raycaster.intersectObjects([low, high])).toEqual([])
    pointing = true
    expect(raycaster.intersectObjects([low, high]).map((hit) => hit.object)).toEqual([low])
  })
})

describe('trackPointer', () => {
  const pointer = (type: string, pointerType: string) =>
    new PointerEvent(type, { pointerType, bubbles: true })

  it('knows of no pointer until one is used', () => {
    const element = document.createElement('div')
    expect(trackPointer(element).pointing()).toBe(false)
  })

  it('keeps a finger after it lifts, so the tap still lands on a line', () => {
    const element = document.createElement('div')
    const tracked = trackPointer(element)

    element.dispatchEvent(pointer('pointerdown', 'touch'))
    element.dispatchEvent(pointer('pointerup', 'touch'))
    element.dispatchEvent(pointer('pointerleave', 'touch')) // browsers send it before the click

    expect(tracked.pointing()).toBe(true)
  })

  it('lets go of a mouse that leaves the graph', () => {
    const element = document.createElement('div')
    const tracked = trackPointer(element)

    element.dispatchEvent(pointer('pointermove', 'mouse'))
    expect(tracked.pointing()).toBe(true)
    element.dispatchEvent(pointer('pointerleave', 'mouse'))
    expect(tracked.pointing()).toBe(false)

    tracked.stop()
    element.dispatchEvent(pointer('pointermove', 'mouse'))
    expect(tracked.pointing()).toBe(false)
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
