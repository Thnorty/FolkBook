import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

const ME = { id: 'u1', email: 'ela@example.com', is_admin: false, me: { id: 'me', name: 'Ela' } }

const space = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  color: 'teal',
  description: '',
  share_contact_details: false,
  role: 'owner',
  owner: { id: 'me', name: 'Ela' },
  people_count: 0,
  member_count: 0,
  ...extra,
})

const CLIMBING = space('s1', 'Climbing club', {
  description: 'Tuesday & Thursday nights at Bouldergarten.',
  people_count: 2,
  member_count: 2,
})
const FAMILY = space('s2', 'Family', { color: 'clay', people_count: 22 })
const HACKATHON = space('s3', 'Hackathon 2026', {
  color: 'plum',
  role: 'viewer',
  owner: { id: 'defne', name: 'Defne' },
  people_count: 11,
  member_count: 3,
})

const person = (id: string, name: string) => ({
  id,
  name,
  how_we_met: '',
  work: '',
  birthday: null,
  tags: [],
  spaces: [],
  photo: null,
  is_me: false,
  is_mine: true,
  owner: { id: 'me', name: 'Ela' },
  needs_details: false,
  last_talked_on: null,
})

type Write = { method: string; path: string; body: unknown }

function server() {
  const writes: Write[] = []
  let spaces = [CLIMBING, FAMILY, HACKATHON]
  const byId = (id: string) => spaces.find((item) => item.id === id)
  fakeServer({
    'GET /api/auth/me': () => json(ME),
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/spaces': () => json({ items: spaces, count: spaces.length }),
    'GET /api/spaces/s1': () => json(byId('s1')),
    'GET /api/spaces/s3': () => json(byId('s3')),
    'GET /api/spaces/new': () => json(byId('new')),
    'POST /api/spaces': async (request) => {
      const body = await request.json()
      writes.push({ method: 'POST', path: '/api/spaces', body })
      if (body.name === 'Family') {
        return json({ detail: 'You already have a space called “Family”.' }, 409)
      }
      spaces = [...spaces, space('new', body.name, body)]
      return json(byId('new'), 201)
    },
    'PATCH /api/spaces/s1': async (request) => {
      const body = await request.json()
      writes.push({ method: 'PATCH', path: '/api/spaces/s1', body })
      spaces = spaces.map((item) => (item.id === 's1' ? { ...item, ...body } : item))
      return json(byId('s1'))
    },
    'DELETE /api/spaces/s1': () => {
      writes.push({ method: 'DELETE', path: '/api/spaces/s1', body: null })
      spaces = spaces.filter((item) => item.id !== 's1')
      return new Response(null, { status: 204 })
    },
    'GET /api/people': (request) => {
      const query = new URL(request.url).searchParams
      const inClimbing = [person('oskar', 'Oskar Lind'), person('ines', 'Ines Duarte')]
      const items = query.get('space') === 's1' ? inClimbing : []
      const search = (query.get('search') ?? '').toLowerCase()
      const found = items.filter((p) => p.name.toLowerCase().includes(search))
      return json({ items: found, count: found.length })
    },
  })
  return writes
}

afterEach(clearCookies)

describe('Spaces page', () => {
  it('shows every space as a divider with who owns it', async () => {
    server()
    renderApp('/spaces')

    const page = await screen.findByRole('main')
    const climbing = await within(page).findByRole('link', { name: /Climbing club/ })
    expect(climbing).toHaveTextContent(/2\s*people/)
    expect(climbing).toHaveTextContent('Tuesday & Thursday nights')
    expect(climbing).toHaveTextContent(/You own it · 2 members/i)
    expect(within(page).getByRole('link', { name: /Family/ })).toHaveTextContent(/Private/i)
    expect(within(page).getByRole('link', { name: /Hackathon 2026/ })).toHaveTextContent(
      /Defne's · you can view/i,
    )
    expect(screen.getByText(/3 spaces · a person can be in several/i)).toBeInTheDocument()
  })
})

describe('space page', () => {
  it('lists its people and searches among them', async () => {
    server()
    renderApp('/spaces/s1')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Climbing club' }),
    ).toBeInTheDocument()
    expect(await screen.findByRole('article', { name: 'Oskar Lind' })).toBeInTheDocument()
    expect(screen.getByText('Shared with 2')).toBeInTheDocument()

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search 2 people' }), 'ines')

    await waitFor(() =>
      expect(screen.queryByRole('article', { name: 'Oskar Lind' })).not.toBeInTheDocument(),
    )
    expect(await screen.findByRole('article', { name: 'Ines Duarte' })).toBeInTheDocument()
  })

  it("has no Edit or Delete in someone else's space", async () => {
    server()
    renderApp('/spaces/s3')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hackathon 2026' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Space actions' })).not.toBeInTheDocument()
  })

  it('edits the space', async () => {
    const writes = server()
    renderApp('/spaces/s1')

    await userEvent.click(await screen.findByRole('button', { name: 'Space actions' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit space' }))
    const form = await screen.findByRole('dialog', { name: 'Edit Climbing club' })
    await userEvent.click(within(form).getByRole('radio', { name: /slate/i }))
    await userEvent.click(within(form).getByRole('button', { name: 'Save space' }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({
      method: 'PATCH',
      body: { name: 'Climbing club', color: 'slate' },
    })
  })

  it('deletes the space after asking', async () => {
    const writes = server()
    const router = renderApp('/spaces/s1')

    await userEvent.click(await screen.findByRole('button', { name: 'Space actions' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete space…' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete Climbing club?' })
    expect(confirm).toHaveTextContent('Its people and links stay in your notebook')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete space' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/spaces'))
    expect(writes).toEqual([{ method: 'DELETE', path: '/api/spaces/s1', body: null }])
    expect(await screen.findByText('Climbing club deleted')).toBeInTheDocument()
  })
})

describe('creating a space', () => {
  it('creates it and opens its page', async () => {
    const writes = server()
    const router = renderApp('/spaces')

    await userEvent.click((await screen.findAllByRole('button', { name: /New space/ }))[0])
    const form = await screen.findByRole('dialog', { name: 'New space' })
    expect(within(form).getByText(/Private — only you/)).toBeInTheDocument()
    await userEvent.type(within(form).getByLabelText('Name'), 'Book club')
    await userEvent.click(within(form).getByRole('radio', { name: /ochre/i }))
    await userEvent.type(within(form).getByLabelText(/Description/), 'First Sunday of the month')
    await userEvent.click(within(form).getByRole('button', { name: 'Create space' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/spaces/new'))
    expect(writes).toEqual([
      {
        method: 'POST',
        path: '/api/spaces',
        body: { name: 'Book club', color: 'ochre', description: 'First Sunday of the month' },
      },
    ])
  })

  it('shows which spaces already use each color', async () => {
    server()
    renderApp('/spaces')

    await userEvent.click((await screen.findAllByRole('button', { name: /New space/ }))[0])
    const form = await screen.findByRole('dialog', { name: 'New space' })

    expect(within(form).getByRole('radio', { name: /teal\s*Climbing club/i })).toBeInTheDocument()
    expect(within(form).getByRole('radio', { name: /clay\s*Family/i })).toBeInTheDocument()
  })

  it('says when the name is taken', async () => {
    server()
    renderApp('/spaces')

    await userEvent.click((await screen.findAllByRole('button', { name: /New space/ }))[0])
    const form = await screen.findByRole('dialog', { name: 'New space' })
    await userEvent.type(within(form).getByLabelText('Name'), 'Family')
    await userEvent.click(within(form).getByRole('button', { name: 'Create space' }))

    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'You already have a space called “Family”.',
    )
  })
})
