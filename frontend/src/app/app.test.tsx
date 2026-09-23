import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

/* The whole app (router, guards, shell) against a fake API. */

const ME = { id: 'u1', email: 'ela@example.com', is_admin: false, me: { id: 'p1', name: 'Ela' } }
const space = (id: string, name: string, color: string, people: number, members: number) => ({
  id,
  name,
  color,
  description: '',
  share_contact_details: false,
  role: 'owner',
  owner: { id: 'p1', name: 'Ela' },
  people_count: people,
  member_count: members,
})
const SPACES = {
  items: [space('s1', 'Climbing club', 'teal', 5, 2), space('s2', 'Family', 'clay', 22, 0)],
  count: 2,
}

const noContent = () => new Response(null, { status: 204 })
const unauthorized = () => json({ detail: 'Unauthorized' }, 401)

function loggedInServer(overrides = {}) {
  return fakeServer({
    'GET /api/auth/me': () => json(ME),
    'GET /api/spaces': () => json(SPACES),
    'GET /api/people': () => json({ items: [], count: 148 }),
    'GET /api/auth/csrf': noContent,
    ...overrides,
  })
}

const heading = (name: string) => screen.findByRole('heading', { level: 1, name })
// The sidebar and the bottom tabs are both "Main" navigation; CSS shows one per screen size.
const sidebar = async () => (await screen.findAllByRole('navigation', { name: 'Main' }))[0]

afterEach(clearCookies)

describe('logging in', () => {
  it('sends you to the login page, and back where you were afterwards', async () => {
    let loggedIn = false
    fakeServer({
      'GET /api/auth/me': () => (loggedIn ? json(ME) : unauthorized()),
      'GET /api/auth/csrf': noContent,
      'POST /api/auth/login': () => {
        loggedIn = true
        return json(ME)
      },
      'GET /api/spaces': () => json(SPACES),
      'GET /api/people': () => json({ items: [], count: 148 }),
    })
    const router = renderApp('/graph')

    await heading('Log in')
    expect(router.state.location.search).toEqual({ redirect: '/graph' })
    await userEvent.type(screen.getByLabelText('Email'), 'ela@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'secret123')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

    await heading('Graph')
    expect(router.state.location.pathname).toBe('/graph')
  })

  it('shows why a login failed', async () => {
    fakeServer({
      'GET /api/auth/me': unauthorized,
      'GET /api/auth/csrf': noContent,
      'POST /api/auth/login': () => json({ detail: 'Wrong email or password.' }, 401),
    })
    renderApp('/login')

    await userEvent.type(await screen.findByLabelText('Email'), 'ela@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'nope-nope')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.')
  })

  it("doesn't follow a redirect to another site", async () => {
    loggedInServer()
    const router = renderApp('/login?redirect=https%3A%2F%2Fevil.example')

    await heading('Today')
    expect(router.state.location.pathname).toBe('/')
  })

  it('goes back to the login page when the session ends', async () => {
    let sessionEnded = false
    loggedInServer({
      'GET /api/auth/me': () => (sessionEnded ? unauthorized() : json(ME)),
      'GET /api/spaces': () => (sessionEnded ? unauthorized() : json(SPACES)),
    })
    const router = renderApp('/people')
    await heading('People')

    sessionEnded = true
    await router.options.context.queryClient.invalidateQueries({ queryKey: ['spaces'] })

    await heading('Log in')
    expect(router.state.location.search).toEqual({ redirect: '/people' })
  })

  it('logs out from the menu under your name', async () => {
    loggedInServer({ 'POST /api/auth/logout': noContent })
    renderApp('/')

    await userEvent.click(await screen.findByRole('button', { name: /Ela \(me\)/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Log out' }))

    await heading('Log in')
  })
})

describe('the shell', () => {
  it('lists the sections and your spaces, and marks where you are', async () => {
    loggedInServer()
    renderApp('/people')

    const nav = await sidebar()
    expect(await within(nav).findByRole('link', { name: /People\s*148/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('link', { name: 'Today' })).not.toHaveAttribute('aria-current')
    expect(
      await within(nav).findByRole('link', { name: /Climbing club\s*\(shared\)/ }),
    ).toBeVisible()
    expect(within(nav).getByRole('link', { name: /Family\s*22/ })).toHaveAttribute(
      'href',
      '/spaces/s2',
    )
  })

  it('moves between pages', async () => {
    loggedInServer()
    renderApp('/')
    await heading('Today')

    await userEvent.click(within(await sidebar()).getByRole('link', { name: 'Graph' }))

    await heading('Graph')
    expect(document.title).toBe('Graph · FolkBook')
  })

  it('has phone tabs with a quick capture button in the middle', async () => {
    loggedInServer()
    renderApp('/')

    const tabs = (await screen.findAllByRole('navigation', { name: 'Main' }))[1]
    const labels = within(tabs)
      .getAllByRole('link')
      .map((link) => link.getAttribute('aria-label') ?? link.textContent)
    expect(labels).toEqual(['Today', 'People', 'Quick capture', 'Graph', 'Me'])
  })

  it('shows a not-found page for unknown addresses', async () => {
    loggedInServer()
    renderApp('/nowhere')

    await heading('Page not found')
  })
})

describe('keyboard shortcuts', () => {
  it('N adds a person and Shift+N opens quick capture', async () => {
    loggedInServer()
    renderApp('/')
    await heading('Today')

    fireEvent.keyDown(window, { key: 'N', shiftKey: true })
    await heading('Quick capture')

    fireEvent.keyDown(window, { key: 'n' })
    expect(await screen.findByRole('dialog', { name: 'Add someone' })).toBeInTheDocument()
  })

  it('Ctrl+K opens the palette, which jumps to what you pick', async () => {
    loggedInServer()
    renderApp('/')
    await heading('Today')

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const palette = await screen.findByRole('dialog', { name: 'Command palette' })
    await userEvent.type(within(palette).getByRole('combobox'), 'family')
    await userEvent.keyboard('{Enter}')

    await heading('Space')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('the palette shows the shortcuts it knows', async () => {
    loggedInServer()
    renderApp('/')
    await userEvent.click(await screen.findByRole('button', { name: /Search/ }))

    const palette = await screen.findByRole('dialog', { name: 'Command palette' })
    expect(within(palette).getByRole('option', { name: /Add person\s*N/ })).toBeInTheDocument()
    expect(
      within(palette).getByRole('option', { name: /Quick capture\s*Shift\+N/ }),
    ).toBeInTheDocument()
  })

  it("doesn't react to letters typed in a field", async () => {
    loggedInServer()
    const router = renderApp('/')
    await heading('Today')

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const input = within(await screen.findByRole('dialog')).getByRole('combobox')
    await userEvent.type(input, 'n')

    await waitFor(() => expect(input).toHaveValue('n'))
    expect(router.state.location.pathname).toBe('/')
  })
})
