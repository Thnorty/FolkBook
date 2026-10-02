import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

const ME = { id: 'u1', email: 'ela@example.com', is_admin: false, me: { id: 'me', name: 'Ela' } }
const ref = (id: string, name: string) => ({ id, name })

const space = (id: string, name: string, role: string, owner = ref('me', 'Ela')) => ({
  id,
  name,
  color: 'plum',
  description: '',
  share_contact_details: false,
  role,
  owner,
  people_count: 11,
  member_count: 2,
})
const HACKATHON = space('s9', 'Hackathon 2026', 'viewer', ref('defne', 'Defne Aydın'))
const CLIMBING = space('s1', 'Climbing club', 'owner')

const TOM = {
  id: 'tom2',
  name: 'Tom Bergqvist',
  how_we_met: 'Met through Defne at Hackathon 2026',
  work: '',
  birthday: null,
  tags: [],
  spaces: [],
  photo: null,
  is_me: false,
  is_mine: true,
  owner: ref('me', 'Ela'),
  needs_details: false,
  last_talked_on: null,
  added_at: '2026-09-22T09:00:00Z',
  pronouns: null,
  kept: { from_owner: 'Defne Aydın', space: 'Hackathon 2026', at: '2026-09-22T09:00:00Z' },
  contact_methods: [],
  can_edit: true,
  can_delete: true,
  can_hide: false,
}

const STOPPED = {
  id: 'n1',
  reason: 'stopped_sharing',
  by: 'Defne Aydın',
  space: 'Hackathon 2026',
  about: 'Ela',
  lost: 11,
  kept: [ref('tom2', 'Tom Bergqvist'), ref('ola2', 'Ola Nowak'), ref('jin2', 'Jin Park')],
  at: '2026-09-22T09:00:00Z',
}

type Write = { method: string; path: string }
type Overrides = Record<string, (request: Request) => Response | Promise<Response>>

function server(overrides: Overrides = {}) {
  const writes: Write[] = []
  const record = (request: Request) =>
    writes.push({ method: request.method, path: new URL(request.url).pathname })
  const none = () => json({ items: [], count: 0 })
  fakeServer({
    'GET /api/auth/me': () => json(ME),
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/spaces': () => json({ items: [CLIMBING, HACKATHON], count: 2 }),
    'GET /api/spaces/s9': () => json(HACKATHON),
    'GET /api/spaces/s1': () => json(CLIMBING),
    'GET /api/spaces/s9/members': () =>
      json([
        { user_id: 'u2', name: 'Defne Aydın', email: 'd@x', role: 'owner', is_you: false },
        { user_id: 'u1', name: 'Ela', email: 'e@x', role: 'viewer', is_you: true },
      ]),
    'GET /api/spaces/s1/members': () =>
      json([
        { user_id: 'u1', name: 'Ela', email: 'e@x', role: 'owner', is_you: true },
        { user_id: 'u3', name: 'Sofia Lind', email: 's@x', role: 'viewer', is_you: false },
      ]),
    'GET /api/spaces/s9/hidden-people': none,
    'GET /api/spaces/s1/hidden-people': none,
    'GET /api/spaces/s9/leave-preview': () =>
      json({
        kept: [{ person: ref('tom', 'Tom Bergqvist'), notes: 1, memory_aids: 2, interactions: 0 }],
        leaving: 9,
        own_people: 0,
      }),
    'POST /api/spaces/s9/leave': (request) => {
      record(request)
      return json({ kept: [ref('tom2', 'Tom Bergqvist')] })
    },
    'DELETE /api/spaces/s1/members/u3': (request) => {
      record(request)
      return new Response(null, { status: 204 })
    },
    'POST /api/spaces/s1/stop-sharing': (request) => {
      record(request)
      return new Response(null, { status: 204 })
    },
    'GET /api/people': none,
    'GET /api/graph': () => json({ nodes: [], edges: [] }),
    'GET /api/today/access-ended': () => json([]),
    'DELETE /api/today/access-ended/n1': (request) => {
      record(request)
      return new Response(null, { status: 204 })
    },
    'GET /api/people/tom2': () => json(TOM),
    'GET /api/people/tom2/family': () => json([]),
    'GET /api/people/tom2/note': () => json({ body: '', updated_at: null }),
    'GET /api/relationships': none,
    'GET /api/memory-aids': none,
    'GET /api/interactions': none,
    ...overrides,
  })
  return writes
}

afterEach(() => {
  clearCookies()
  localStorage.clear()
})

describe('leaving a space', () => {
  it('says who you keep, leaves, and tells you', async () => {
    const writes = server()
    const router = renderApp('/spaces/s9')

    await userEvent.click(await screen.findByRole('button', { name: 'Space actions' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Leave space…' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Leave Hackathon 2026?' })
    expect(
      await within(dialog).findByText('You keep copies of the 1 person you wrote notes on:'),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('1 note · 2 memory aids')).toBeInTheDocument()
    expect(within(dialog).getByText(/The other 9 people leave your book/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Defne and the other members lose nothing/)).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Leave Hackathon 2026' }))

    expect(await screen.findByText('You left Hackathon 2026')).toBeInTheDocument()
    expect(screen.getByText('You kept Tom.')).toBeInTheDocument()
    expect(writes).toEqual([{ method: 'POST', path: '/api/spaces/s9/leave' }])
    await waitFor(() => expect(router.state.location.pathname).toBe('/spaces'))
  })
})

describe('the owner ending access', () => {
  it('removes a member after asking', async () => {
    const writes = server()
    renderApp('/spaces/s1')

    await userEvent.click(await screen.findByRole('button', { name: 'Sofia Lind: actions' }))
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Remove from Climbing club…' }),
    )
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Remove Sofia from Climbing club?',
    })
    expect(within(dialog).getByText(/as a kept copy — you won't see who/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove Sofia' }))

    expect(await screen.findByText('Sofia no longer sees Climbing club')).toBeInTheDocument()
    expect(writes).toEqual([{ method: 'DELETE', path: '/api/spaces/s1/members/u3' }])
  })

  it('stops sharing the whole space', async () => {
    const writes = server()
    renderApp('/spaces/s1')

    await userEvent.click(await screen.findByRole('button', { name: 'Space actions' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Stop sharing…' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Stop sharing Climbing club?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stop sharing' }))

    expect(await screen.findByText('Climbing club is private again')).toBeInTheDocument()
    expect(writes).toEqual([{ method: 'POST', path: '/api/spaces/s1/stop-sharing' }])
  })
})

describe('when someone else ends your access', () => {
  it('shows a card on Today with who you kept, until dismissed, and a toast once', async () => {
    let notices = [STOPPED]
    const writes = server({
      'GET /api/today/access-ended': () => json(notices),
      'DELETE /api/today/access-ended/n1': (request) => {
        writes.push({ method: request.method, path: new URL(request.url).pathname })
        notices = []
        return new Response(null, { status: 204 })
      },
    })
    renderApp('/')

    const card = (
      await screen.findByText(
        'Defne Aydın stopped sharing Hackathon 2026. You kept 3 people you had notes on.',
      )
    ).closest('li')!
    expect(
      within(within(card).getByRole('list', { name: 'Kept' }))
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Tom Bergqvist', 'Ola Nowak', 'Jin Park'])
    expect(within(card).getByText(/The other 8 left with the space/)).toBeInTheDocument()
    expect(
      await screen.findByText(
        // The list follows the locale: "Tom, Ola and Jin" or "Tom, Ola, and Jin".
        /^Defne Aydın stopped sharing Hackathon 2026 — you kept Tom, Ola,? and Jin\.$/,
      ),
    ).toBeInTheDocument()

    await userEvent.click(within(card).getByRole('button', { name: 'Dismiss' }))

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Review kept people' })).not.toBeInTheDocument(),
    )
    expect(writes).toEqual([{ method: 'DELETE', path: '/api/today/access-ended/n1' }])
  })
})

describe('a kept copy', () => {
  it('says where it came from and can go into a space', async () => {
    server()
    renderApp('/people/tom2')

    expect(
      await screen.findByText(
        /^Kept copy · was shared by Defne Aydın in Hackathon 2026 until .*2026$/,
      ),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add to a space' }))
    expect(await screen.findByRole('dialog', { name: /Edit/ })).toBeInTheDocument()
  })
})
