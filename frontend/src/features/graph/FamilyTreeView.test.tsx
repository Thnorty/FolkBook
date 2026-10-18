import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { ELAS_TREE, step, treePerson } from '@/test/familyTree'
import { renderApp } from '@/test/renderApp'

type Router = ReturnType<typeof renderApp>
const param = (router: Router, key: string) =>
  (router.state.location.search as Record<string, string | undefined>)[key]

const ME = { id: 'u1', email: 'ela@example.com', is_admin: false, me: { id: 'ela', name: 'Ela' } }

function detail(id: string, name: string) {
  return {
    id,
    name,
    how_we_met: '',
    work: '',
    birthday: null,
    tags: [],
    spaces: [],
    is_me: id === 'ela',
    is_mine: true,
    owner: { id: 'ela', name: 'Ela' },
    photo: null,
    needs_details: false,
    last_talked_on: null,
    pronouns: null,
    added_at: '2026-01-01T00:00:00Z',
    kept: null,
    contact_methods: [],
    can_edit: true,
    can_delete: true,
    can_hide: false,
    from_import: null,
  }
}

const NETWORK = {
  nodes: ELAS_TREE.people.map((p) => ({
    id: p.id,
    name: p.name,
    is_me: p.is_me,
    spaces: [],
    photo_url: null,
  })),
  edges: [],
}

function server(trees: Record<string, unknown> = { ela: ELAS_TREE }) {
  fakeServer({
    'GET /api/auth/me': () => json(ME),
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/spaces': () => json({ items: [], count: 0 }),
    // Searching for someone ("Tree of", "How do I know…?") finds Nilgün.
    'GET /api/people': (request) =>
      new URL(request.url).searchParams.get('search')
        ? json({ items: [detail('nilgun', 'Nilgün Aksoy')], count: 1 })
        : json({ items: [], count: 0 }),
    'GET /api/graph': () => json(NETWORK),
    'GET /api/memory-aids': () => json({ items: [], count: 0 }),
    'GET /api/relationships': () => json({ items: [], count: 0 }),
    ...Object.fromEntries(
      ELAS_TREE.people.map((p) => [`GET /api/people/${p.id}`, () => json(detail(p.id, p.name))]),
    ),
    ...Object.fromEntries(
      Object.entries(trees).map(([id, tree]) => [
        `GET /api/graph/family-tree/${id}`,
        () => (tree ? json(tree) : json({ detail: 'Not Found' }, 404)),
      ]),
    ),
  })
}

const tree = () => screen.findByRole('region', { name: 'Family tree' })

afterEach(clearCookies)
beforeAll(() => import('./GraphPage'))

describe('family tree mode', () => {
  it('switches between the network and the tree', async () => {
    server()
    const router = renderApp('/graph')

    await userEvent.click(await screen.findByRole('button', { name: 'Family tree' }))
    expect(await tree()).toBeInTheDocument()
    expect(param(router, 'tree')).toBe('ela')

    await userEvent.click(screen.getByRole('button', { name: 'Network' }))
    await waitFor(() => expect(param(router, 'tree')).toBeUndefined())
  })

  it('says whose tree it is, how many, and how far it goes', async () => {
    server()
    renderApp('/graph?tree=ela')

    await tree()
    const treeOf = screen.getByRole('button', { name: 'Pick whose tree' }).parentElement!
    expect(within(treeOf).getByText('Tree of')).toBeInTheDocument()
    expect(within(treeOf).getByText('Ela Demir')).toBeInTheDocument()
    expect(screen.getByText('Family · 11 people')).toBeInTheDocument()
    expect(screen.getByText('2 generations up · 1 down')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Family only' })).toBeNull()
  })

  it('picks someone else’s tree', async () => {
    server({ ela: ELAS_TREE, nilgun: { ...ELAS_TREE, root: 'nilgun' } })
    const router = renderApp('/graph?tree=ela')
    await tree()

    await userEvent.click(screen.getByRole('button', { name: 'Pick whose tree' }))
    await userEvent.type(screen.getByLabelText('Tree of'), 'Nil')
    await userEvent.click(
      within(await screen.findByRole('list', { name: 'People' })).getByRole('button', {
        name: /Nilgün Aksoy/,
      }),
    )

    await waitFor(() => expect(param(router, 'tree')).toBe('nilgun'))
  })

  it('hides in-laws and former partners with their toggles', async () => {
    const withEx = {
      ...ELAS_TREE,
      people: [
        ...ELAS_TREE.people,
        treePerson('ex', 'Old Flame', 0, [step('partner', null, { former: true })], {
          via_former: true,
        }),
      ],
    }
    server({ ela: withEx })
    renderApp('/graph?tree=ela')
    const drawn = await tree()
    const zeynep = { name: 'Zeynep Demir, sister-in-law' }

    expect(within(drawn).getByRole('button', zeynep)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'In-laws' }))
    expect(within(drawn).queryByRole('button', zeynep)).toBeNull()

    expect(
      within(drawn).getByRole('button', { name: 'Old Flame, former partner' }),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Former partners' }))
    expect(within(drawn).queryByRole('button', { name: /Old Flame/ })).toBeNull()
  })

  it('opens someone beside the tree, and shows their tree', async () => {
    server({ ela: ELAS_TREE, can: { ...ELAS_TREE, root: 'can' } })
    const router = renderApp('/graph?tree=ela')
    const drawn = await tree()

    await userEvent.click(within(drawn).getByRole('button', { name: 'Can Demir, brother' }))
    const peek = await screen.findByRole('complementary', { name: 'Peek' })
    expect(within(peek).getByRole('button', { name: 'How do I know them?' })).toBeInTheDocument()
    await userEvent.click(within(peek).getByRole('button', { name: 'Show their tree' }))

    await waitFor(() => expect(param(router, 'tree')).toBe('can'))
  })

  it('adds a missing parent through the connection dialog', async () => {
    server()
    renderApp('/graph?tree=ela')
    const drawn = await tree()

    await userEvent.click(
      within(drawn).getAllByRole('button', { name: 'Add parent of Nilgün Aksoy' })[0],
    )

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('radio', { name: /^Parent of/ })).toBeChecked()
  })

  it('goes to the network to show how you know someone', async () => {
    server()
    const router = renderApp('/graph?tree=ela')
    await tree()

    await userEvent.type(screen.getByLabelText('How do I know…?'), 'Nil')
    await userEvent.click(
      within(await screen.findByRole('list', { name: 'People' })).getByRole('button', {
        name: /Nilgün Aksoy/,
      }),
    )

    await waitFor(() => expect(param(router, 'how')).toBe('nilgun'))
    expect(param(router, 'tree')).toBeUndefined()
  })

  it('goes back to the network with Esc', async () => {
    server()
    const router = renderApp('/graph?tree=ela')
    await tree()

    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(param(router, 'tree')).toBeUndefined())
  })

  it('says when there’s no family yet', async () => {
    server({
      ela: {
        root: 'ela',
        people: [treePerson('ela', 'Ela Demir', 0, [], { is_me: true, missing_parents: 2 })],
        links: [],
      },
    })
    renderApp('/graph?tree=ela')
    await tree()

    expect(screen.getByText('No family linked to Ela yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect…' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add parent of Ela Demir' })).toHaveLength(2)
  })

  it('says when the person is gone', async () => {
    server({ gone: null })
    renderApp('/graph?tree=gone')

    expect(await screen.findByText("This person isn't in your book anymore.")).toBeInTheDocument()
  })
})
