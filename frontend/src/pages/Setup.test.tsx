import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

const ELA = {
  id: 'u1',
  email: 'ela@example.com',
  is_admin: true,
  me: { id: 'me', name: 'Ela Demir' },
}

type Write = { method: string; path: string; body: unknown }

function newServer() {
  const writes: Write[] = []
  let user: typeof ELA | null = null
  const record = async (request: Request) => {
    const body = await request.json()
    writes.push({ method: request.method, path: new URL(request.url).pathname, body })
    return body
  }
  fakeServer({
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/auth/me': () => (user ? json(user) : json({ detail: 'Not logged in' }, 401)),
    'GET /api/setup': () => json({ needed: user === null }),
    'POST /api/setup': async (request) => {
      await record(request)
      user = ELA
      return json(ELA, 201)
    },
    'PATCH /api/people/me': async (request) => json({ id: 'me', ...(await record(request)) }),
    'POST /api/invites': async (request) => {
      await record(request)
      return json({ id: 'inv', token: 'tok', path: '/i/tok' }, 201)
    },
    'GET /api/spaces': () => json({ items: [], count: 0 }),
    'GET /api/people': () => json({ items: [], count: 0 }),
    'GET /api/today/birthdays': () => json([]),
    'GET /api/keep-in-touch/due': () => json([]),
    'GET /api/today/remember': () => new Response(null, { status: 204 }),
  })
  return writes
}

afterEach(clearCookies)

describe('first run', () => {
  it('sets up the admin account and your Me, then opens FolkBook', async () => {
    const writes = newServer()
    const router = renderApp('/')

    await userEvent.click(await screen.findByRole('button', { name: 'Get started' }))
    expect(router.state.location.pathname).toBe('/setup')
    await userEvent.type(screen.getByLabelText('Email'), 'ela@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'a long passphrase')
    await userEvent.type(screen.getByLabelText('Password again'), 'a long passphrase!')
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('alert')).toHaveTextContent("The passwords don't match.")
    await userEvent.type(screen.getByLabelText('Password again'), '{Backspace}')
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await userEvent.type(await screen.findByLabelText('Your name'), 'Ela Demir')
    await userEvent.type(screen.getByLabelText('Day'), '3')
    await userEvent.selectOptions(screen.getByLabelText('Month'), '4')
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await userEvent.click(await screen.findByRole('button', { name: 'Create link' }))
    expect(await screen.findByRole('textbox', { name: 'Invite link' })).toHaveValue(
      `${window.location.origin}/i/tok`,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Open FolkBook' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(writes).toEqual([
      {
        method: 'POST',
        path: '/api/setup',
        body: { email: 'ela@example.com', password: 'a long passphrase', name: 'Ela Demir' },
      },
      {
        method: 'PATCH',
        path: '/api/people/me',
        body: { birthday: { day: 3, month: 4, year: null } },
      },
      { method: 'POST', path: '/api/invites', body: {} },
    ])
  })

  it('sends the login page to setup until the server has an account', async () => {
    newServer()
    const router = renderApp('/login')

    await screen.findByRole('heading', { name: 'Welcome to your FolkBook' })
    expect(router.state.location.pathname).toBe('/setup')
  })
})

describe('forgot password', () => {
  it('says to ask the admin for a reset link', async () => {
    fakeServer({
      'GET /api/auth/me': () => json({ detail: 'Not logged in' }, 401),
      'GET /api/setup': () => json({ needed: false }),
    })
    renderApp('/login')

    await userEvent.click(await screen.findByRole('button', { name: 'Forgot password?' }))

    expect(screen.getByRole('status')).toHaveTextContent(
      /Ask your FolkBook's admin for a reset link/,
    )
  })
})
