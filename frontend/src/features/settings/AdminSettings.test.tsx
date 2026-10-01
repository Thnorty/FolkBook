import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

const ADMIN = { id: 'u1', email: 'ela@example.com', is_admin: true, me: { id: 'me', name: 'Ela' } }
const user = (id: string, name: string, extra = {}) => ({
  id,
  email: `${name.toLowerCase()}@example.com`,
  name,
  is_admin: false,
  is_active: true,
  last_active: null,
  ...extra,
})
const CLIMBING = {
  id: 's1',
  name: 'Climbing club',
  color: 'sage',
  description: '',
  share_contact_details: false,
  role: 'owner',
  owner: { id: 'me', name: 'Ela' },
  people_count: 3,
  member_count: 0,
}
const invite = (id: string, extra = {}) => ({
  id,
  token: id,
  path: `/i/${id}`,
  created_by: { id: 'me', name: 'Ela' },
  expires_at: '2099-01-01T00:00:00Z',
  max_uses: 1,
  uses: 0,
  is_usable: true,
  space: null,
  role: 'viewer',
  ...extra,
})

type Write = { method: string; path: string; body: unknown }

function server() {
  const writes: Write[] = []
  let users = [user('u1', 'Ela', { is_admin: true }), user('u2', 'Deniz')]
  let invites = [invite('old', { is_usable: false, uses: 1 })]
  const record = async (request: Request) => {
    const body = request.method === 'DELETE' ? null : await request.json()
    writes.push({ method: request.method, path: new URL(request.url).pathname, body })
    return body as Record<string, unknown>
  }
  fakeServer({
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/auth/me': () => json(ADMIN),
    'GET /api/spaces': () => json({ items: [CLIMBING], count: 1 }),
    'GET /api/people': () => json({ items: [], count: 0 }),
    'GET /api/users': () => json({ items: users, count: users.length }),
    'PATCH /api/users/u2': async (request) => {
      const changes = await record(request)
      users = users.map((item) => (item.id === 'u2' ? { ...item, ...changes } : item))
      return json(users[1])
    },
    'POST /api/auth/password-resets': async (request) => {
      await record(request)
      return json(
        { path: '/reset/abc', email: 'deniz@example.com', expires_at: '2026-09-23T10:00:00Z' },
        201,
      )
    },
    'GET /api/invites': () => json({ items: invites, count: invites.length }),
    'POST /api/invites': async (request) => {
      const body = await record(request)
      invites = [
        invite('new', {
          space: body.space_id ? { id: 's1', name: 'Climbing club', color: 'sage' } : null,
        }),
        ...invites,
      ]
      return json(invites[0], 201)
    },
    'DELETE /api/invites/old': async (request) => {
      await record(request)
      invites = invites.filter((item) => item.id !== 'old')
      return new Response(null, { status: 204 })
    },
  })
  return writes
}

const page = (title: string) => screen.findByRole('region', { name: title })

afterEach(clearCookies)

describe('admin settings', () => {
  it('makes a reset link, an admin, and deactivates after asking', async () => {
    const writes = server()
    renderApp('/settings/users')
    const users = await page('Users')
    expect(await within(users).findByText('(you)')).toBeInTheDocument()
    const menu = () => within(users).getByRole('button', { name: 'Deniz: manage' })

    await userEvent.click(menu())
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Make a password reset link' }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Reset link for Deniz' })
    expect(await within(dialog).findByRole('textbox', { name: 'Reset link' })).toHaveValue(
      `${window.location.origin}/reset/abc`,
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }))

    await userEvent.click(menu())
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Make admin' }))
    expect(await screen.findByText('Deniz is an admin now')).toBeInTheDocument()

    await userEvent.click(menu())
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Deactivate account…' }))
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Deactivate' }),
    )

    await waitFor(() => expect(writes).toHaveLength(3))
    expect(writes).toEqual([
      { method: 'POST', path: '/api/auth/password-resets', body: { user_id: 'u2' } },
      { method: 'PATCH', path: '/api/users/u2', body: { is_admin: true } },
      { method: 'PATCH', path: '/api/users/u2', body: { is_active: false } },
    ])
  })

  it('creates invite links that share a space, and deletes old ones', async () => {
    const writes = server()
    renderApp('/settings/invites')
    const invites = await page('Invite links')

    await userEvent.click(within(invites).getByRole('radio', { name: '30 days' }))
    await userEvent.click(within(invites).getByRole('radio', { name: 'Up to 10' }))
    await userEvent.selectOptions(
      await within(invites).findByLabelText('Also share a space'),
      'Climbing club (as a viewer)',
    )
    await userEvent.click(within(invites).getByRole('button', { name: 'Create link' }))
    expect(await within(invites).findByRole('textbox', { name: 'Invite link' })).toHaveValue(
      `${window.location.origin}/i/new`,
    )
    await userEvent.click(within(invites).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(writes).toHaveLength(2))
    expect(writes).toEqual([
      {
        method: 'POST',
        path: '/api/invites',
        body: { expires_in_days: 30, max_uses: 10, space_id: 's1' },
      },
      { method: 'DELETE', path: '/api/invites/old', body: null },
    ])
  })

  it('shows the admin sections to admins', async () => {
    server()
    renderApp('/settings')

    const nav = await screen.findByRole('navigation', { name: 'Settings' })
    expect(await within(nav).findByText('Server · admin')).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /Users/ })).toHaveAttribute(
      'href',
      '/settings/users',
    )
  })
})
