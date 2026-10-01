import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

const TOM = { id: 'u2', email: 'tom@example.com', is_admin: false, me: { id: 'tom', name: 'Tom' } }
const HACKATHON = { id: 's9', name: 'Hackathon 2026', color: 'plum' }
const SPACE = {
  ...HACKATHON,
  description: '',
  share_contact_details: false,
  role: 'viewer',
  owner: { id: 'defne', name: 'Defne' },
  people_count: 11,
  member_count: 1,
}
const PREVIEW = {
  invited_by: 'Defne',
  expires_at: '2099-01-01T00:00:00Z',
  space: HACKATHON,
  space_people_count: 11,
  role: 'viewer',
}

type Write = { method: string; path: string; body: unknown }

function server({ loggedIn = false, preview = PREVIEW as unknown } = {}) {
  const writes: Write[] = []
  let user = loggedIn ? TOM : null
  const record = async (request: Request) => {
    const body = request.headers.get('content-type') ? await request.json() : null
    writes.push({ method: request.method, path: new URL(request.url).pathname, body })
  }
  fakeServer({
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/auth/me': () => (user ? json(user) : json({ detail: 'Not logged in' }, 401)),
    'GET /api/invites/by-token/tok': () =>
      preview
        ? json(preview)
        : json({ detail: "This invite link has expired or doesn't exist." }, 404),
    'POST /api/invites/by-token/tok/accept': async (request) => {
      await record(request)
      user = TOM
      return json(TOM, 201)
    },
    'POST /api/invites/by-token/tok/join': async (request) => {
      await record(request)
      return json(HACKATHON)
    },
    'GET /api/spaces/s9': () => json(SPACE),
    'GET /api/spaces/s9/hidden-people': () => json({ items: [], count: 0 }),
    'GET /api/spaces': () => json({ items: [SPACE], count: 1 }),
    'GET /api/people': () => json({ items: [], count: 0 }),
  })
  return writes
}

afterEach(clearCookies)

describe('invite link', () => {
  it('signs you up and opens the shared space', async () => {
    const writes = server()
    const router = renderApp('/i/tok')

    expect(await screen.findByRole('heading', { name: 'Defne invited you' })).toBeInTheDocument()
    expect(screen.getByText('Defne shared Hackathon 2026 with you')).toBeInTheDocument()
    expect(screen.getByText(/11 people · you'll be a viewer/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Log in and join' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Fi%2Ftok',
    )

    await userEvent.type(screen.getByLabelText('Your name'), 'Tom Bergqvist')
    await userEvent.type(screen.getByLabelText('Email'), 'tom@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'a long passphrase')
    await userEvent.click(screen.getByRole('button', { name: 'Create account & join' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/spaces/s9'))
    expect(writes).toEqual([
      {
        method: 'POST',
        path: '/api/invites/by-token/tok/accept',
        body: { name: 'Tom Bergqvist', email: 'tom@example.com', password: 'a long passphrase' },
      },
    ])
  })

  it('lets someone logged in join the space with their account', async () => {
    const writes = server({ loggedIn: true })
    const router = renderApp('/i/tok')

    await userEvent.click(await screen.findByRole('button', { name: 'Join Hackathon 2026' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/spaces/s9'))
    expect(writes).toEqual([{ method: 'POST', path: '/api/invites/by-token/tok/join', body: null }])
  })

  it("says when a link doesn't work", async () => {
    server({ preview: null })
    renderApp('/i/tok')

    expect(
      await screen.findByRole('heading', { name: "This link doesn't work" }),
    ).toBeInTheDocument()
    expect(screen.getByText("This invite link has expired or doesn't exist.")).toBeInTheDocument()
  })
})
