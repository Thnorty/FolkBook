import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'
import type { GraphData } from './graphModel'

type Node = GraphData['nodes'][number]
type Edge = GraphData['edges'][number]

const ME = { id: 'u1', email: 'ela@example.com', is_admin: false, me: { id: 'me', name: 'Ela' } }
const CLIMBING = { id: 's1', name: 'Climbing club', color: 'sage' } as const

const person = (id: string, spaces: Node['spaces'] = []): Node => ({
  id,
  name: id,
  is_me: id === 'me',
  spaces,
  photo_url: null,
})
const link = (source: string, target: string): Edge => ({
  id: `${source}-${target}`,
  source,
  target,
  kind: 'relationship',
  type: 'friend',
  label: '',
  former: false,
  space: null,
})

/** You, three friends, and a climbing club of `club` people; one of them is a friend's friend. */
function bigBook(club: number): GraphData {
  const members = Array.from({ length: club }, (_, i) => person(`c${i + 1}`, [CLIMBING]))
  return {
    nodes: [person('me'), person('a1'), person('a2'), person('a3'), ...members],
    edges: [link('me', 'a1'), link('me', 'a2'), link('me', 'a3'), link('a1', 'c1')],
  }
}

function server(graph: GraphData) {
  return fakeServer({
    'GET /api/auth/me': () => json(ME),
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/spaces': () => json({ items: [], count: 0 }),
    'GET /api/people': () => json({ items: [], count: 0 }),
    'GET /api/graph': () => json(graph),
    'GET /api/graph/neighborhood/a1': () =>
      json({ nodes: graph.nodes.slice(0, 2), edges: graph.edges.slice(0, 1) }),
  })
}

/** Like `server`, but someone's neighborhood never arrives (focus mode, loading). */
function fakeServerWithSlowFocus(graph: GraphData) {
  fakeServer({
    'GET /api/auth/me': () => json(ME),
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/spaces': () => json({ items: [], count: 0 }),
    'GET /api/people': () => json({ items: [], count: 0 }),
    'GET /api/graph': () => json(graph),
    'GET /api/graph/neighborhood/a1': () => new Promise<Response>(() => {}),
  })
}

// The test canvas (test/setup.ts): people as buttons, then a list of lines.
const network = async () => (await screen.findByRole('list', { name: 'Lines' })).parentElement!
const BUBBLE = 'Climbing club · +297 more'

afterEach(() => {
  clearCookies()
  localStorage.clear()
})
beforeAll(() => import('./GraphPage'))

describe('big notebooks', () => {
  it('fold faraway spaces into bubbles, and say so', async () => {
    server(bigBook(298)) // 301 people besides you
    renderApp('/graph')
    const drawn = await network()

    expect(within(drawn).getByRole('button', { name: BUBBLE })).toBeInTheDocument()
    expect(within(drawn).queryByRole('button', { name: 'c2' })).toBeNull()
    expect(within(drawn).getByRole('button', { name: 'c1' })).toBeInTheDocument() // 2 steps
    expect(screen.getByText(/You \+ 2 steps · 4 of 301/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show all 301' })).toBeInTheDocument()
  })

  it('unfold a space on click, without opening anyone', async () => {
    const requests = server(bigBook(298))
    renderApp('/graph')
    const drawn = await network()

    await userEvent.click(within(drawn).getByRole('button', { name: BUBBLE }))

    expect(await within(drawn).findByRole('button', { name: 'c2' })).toBeInTheDocument()
    expect(within(drawn).queryByRole('button', { name: BUBBLE })).toBeNull()
    expect(screen.queryByRole('complementary', { name: 'Peek' })).toBeNull()
    expect(requests.some((request) => request.url.includes('fold'))).toBe(false)
  })

  it('show everyone, and remember it on this device', async () => {
    server(bigBook(298))
    renderApp('/graph')
    await network()

    await userEvent.click(screen.getByRole('button', { name: 'Show all 301' }))
    expect(within(await network()).getByRole('button', { name: 'c2' })).toBeInTheDocument()
    expect(screen.getByText('Showing all 301')).toBeInTheDocument()

    cleanup()
    server(bigBook(298))
    renderApp('/graph')
    expect(within(await network()).getByRole('button', { name: 'c2' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Fold faraway spaces' }))
    expect(within(await network()).getByRole('button', { name: BUBBLE })).toBeInTheDocument()
  })

  it('unfold a space picked in the filters', async () => {
    server(bigBook(298))
    renderApp('/graph')
    const drawn = await network()

    await userEvent.click(screen.getByRole('button', { name: 'Climbing club' }))

    await waitFor(() => expect(within(drawn).getByRole('button', { name: 'c2' })).toBeVisible())
    expect(within(drawn).queryByRole('button', { name: BUBBLE })).toBeNull()
  })

  it('fold an unfolded space back into its bubble from the banner', async () => {
    server(bigBook(298))
    renderApp('/graph')
    const drawn = await network()
    await userEvent.click(within(drawn).getByRole('button', { name: BUBBLE }))
    await within(drawn).findByRole('button', { name: 'c2' })

    await userEvent.click(screen.getByRole('button', { name: 'Fold Climbing club again' }))

    expect(await within(drawn).findByRole('button', { name: BUBBLE })).toBeInTheDocument()
    expect(within(drawn).queryByRole('button', { name: 'c2' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Fold Climbing club again' })).toBeNull()
  })

  it('fold everything back to the start, from unfolded bubbles or from Show all', async () => {
    server(bigBook(298))
    renderApp('/graph')
    const drawn = await network()
    expect(screen.queryByRole('button', { name: 'Fold faraway spaces' })).toBeNull()

    await userEvent.click(within(drawn).getByRole('button', { name: BUBBLE }))
    await userEvent.click(await screen.findByRole('button', { name: 'Fold faraway spaces' }))
    expect(await within(drawn).findByRole('button', { name: BUBBLE })).toBeInTheDocument()

    // Unfold, then show all, then fold: back to the start, not to the unfolded club.
    await userEvent.click(within(drawn).getByRole('button', { name: BUBBLE }))
    await userEvent.click(screen.getByRole('button', { name: 'Show all 301' }))
    await userEvent.click(screen.getByRole('button', { name: 'Fold faraway spaces' }))
    expect(await within(drawn).findByRole('button', { name: BUBBLE })).toBeInTheDocument()
    expect(within(drawn).queryByRole('button', { name: 'c2' })).toBeNull()
  })

  it('keep the person open beside the graph when a bubble unfolds', async () => {
    server(bigBook(298))
    renderApp('/graph')
    const drawn = await network()

    await userEvent.click(within(drawn).getByRole('button', { name: 'a1' }))
    const peek = await screen.findByRole('complementary', { name: 'Peek' })
    await userEvent.click(within(drawn).getByRole('button', { name: BUBBLE }))

    expect(await within(drawn).findByRole('button', { name: 'c2' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Peek' })).toBe(peek)
  })

  it('say nothing is folded when everyone is near', async () => {
    const book = bigBook(298)
    // Everyone in the club is your friend: all within reach.
    server({ ...book, edges: [...book.edges, ...book.nodes.slice(4).map((n) => link('me', n.id))] })
    renderApp('/graph')
    await network()

    expect(screen.getByText('You + 2 steps · 301 of 301')).toBeInTheDocument()
    expect(screen.queryByText(/faraway spaces are folded/)).toBeNull()
  })

  it('stay folded while a focus loads, without the banner', async () => {
    fakeServerWithSlowFocus(bigBook(298))
    renderApp('/graph?focus=a1')
    const drawn = await network()

    expect(within(drawn).getByRole('button', { name: BUBBLE })).toBeInTheDocument()
    expect(within(drawn).queryByRole('button', { name: 'c2' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull()
  })

  it('never fold in focus mode', async () => {
    server(bigBook(298))
    renderApp('/graph?focus=a1')
    await network()

    expect(screen.queryByText(/faraway spaces are folded/)).toBeNull()
    expect(screen.queryByRole('button', { name: BUBBLE })).toBeNull()
  })

  it('leave a notebook of 300 people as it is', async () => {
    server(bigBook(297)) // 300 besides you
    renderApp('/graph')
    const drawn = await network()

    expect(within(drawn).getByRole('button', { name: 'c297' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull()
  })
})
