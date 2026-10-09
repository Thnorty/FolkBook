import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { formatDay } from '@/lib/dates'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

const ME = { id: 'u1', email: 'ela@example.com', is_admin: false, me: { id: 'me', name: 'Ela' } }
const HOUR = 60 * 60 * 1000
const FRIENDS = { id: 's1', name: 'Friends' }
const FAMILY = { id: 's2', name: 'Family' }
const space = (ref: { id: string; name: string }, color: string) => ({
  ...ref,
  color,
  description: '',
  share_contact_details: false,
  role: 'owner',
  owner: { id: 'me', name: 'Ela' },
  people_count: 3,
  member_count: 0,
})
const apiKey = (id: string, name: string, extra = {}) => ({
  id,
  name,
  last_five: `${id}k42`,
  read_only: true,
  include_private: false,
  limited: false,
  spaces: [],
  expires_at: null,
  last_used_at: null,
  created_at: '2026-10-01T09:00:00Z',
  expired: false,
  ...extra,
})
const KEYS = [
  apiKey('k1', 'Home Assistant', {
    last_used_at: new Date(Date.now() - 2 * HOUR).toISOString(),
  }),
  apiKey('k2', 'Obsidian sync', {
    last_five: '13k39',
    read_only: false,
    include_private: true,
    limited: true,
    spaces: [FRIENDS, FAMILY],
    expires_at: '2027-03-12T09:00:00Z',
  }),
  apiKey('k3', 'Birthday script', { limited: true, spaces: [FAMILY] }),
  apiKey('k4', 'Old export job', { expires_at: '2026-01-01T09:00:00Z', expired: true }),
  apiKey('k5', 'Gone spaces', { limited: true, spaces: [] }),
]

type Write = { method: string; path: string; body: unknown }

function server({ keys: initial = KEYS, revokedElsewhere = false } = {}) {
  const writes: Write[] = []
  let keys = [...initial]
  const routes: Parameters<typeof fakeServer>[0] = {
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/auth/me': () => json(ME),
    'GET /api/spaces': () =>
      json({ items: [space(FRIENDS, 'sage'), space(FAMILY, 'clay')], count: 2 }),
    'GET /api/people': () => json({ items: [], count: 0 }),
    'GET /api/api-keys': () => json({ items: keys, count: keys.length }),
  }
  for (const { id } of initial) {
    routes[`DELETE /api/api-keys/${id}`] = (request) => {
      writes.push({ method: 'DELETE', path: new URL(request.url).pathname, body: null })
      keys = keys.filter((key) => key.id !== id)
      return revokedElsewhere
        ? json({ detail: 'Not Found' }, 404)
        : new Response(null, { status: 204 })
    }
  }
  fakeServer(routes)
  return writes
}

const page = () => screen.findByRole('region', { name: 'API keys' })
const row = async (name: string) =>
  within(await screen.findByRole('listitem', { name }, { timeout: 3000 }))

afterEach(clearCookies)

describe('API keys', () => {
  it('lists your keys with what each can do', async () => {
    server()
    renderApp('/settings/api-keys')
    await page()

    const obsidian = await row('Obsidian sync')
    expect(obsidian.getByText('fb_…13k39')).toBeInTheDocument()
    expect(obsidian.getByText('read-write')).toBeInTheDocument()
    expect(obsidian.getByText('+ private notes')).toBeInTheDocument()
    expect(obsidian.getByText('Friends, Family')).toBeInTheDocument()
    expect(obsidian.getByText(formatDay('2027-03-12'))).toBeInTheDocument()

    const home = await row('Home Assistant')
    expect(home.getByText(/2 hours ago/)).toBeInTheDocument()
    expect(home.getByText('All spaces')).toBeInTheDocument()
    expect(home.getByText('Never')).toBeInTheDocument()
    expect(home.queryByText('+ private notes')).not.toBeInTheDocument()

    expect((await row('Birthday script')).getByText('Never used')).toBeInTheDocument()
    const old = await row('Old export job')
    expect(old.getByText('Expired')).toBeInTheDocument()
    expect(old.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(old.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument()
    expect((await row('Gone spaces')).getByText('No spaces left')).toBeInTheDocument()
  })

  it('shows the section after Profile & account', async () => {
    server()
    renderApp('/settings/api-keys')

    const nav = await screen.findByRole('navigation', { name: 'Settings' })
    const links = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent)
    expect(links.slice(0, 2)).toEqual(['Profile & account', 'API keys'])
  })

  it('says what keys are for when there are none', async () => {
    server({ keys: [] })
    renderApp('/settings/api-keys')
    const keys = await page()

    expect(
      within(keys).getByText(
        'For scripts and apps that read or write your book. Each key only sees the spaces you pick.',
      ),
    ).toBeInTheDocument()
    expect(within(keys).getByRole('button', { name: '+ Create key' })).toBeInTheDocument()
    await waitFor(() =>
      expect(within(keys).queryByRole('list', { name: 'API keys' })).not.toBeInTheDocument(),
    )
  })

  it('revokes a key after asking in place', async () => {
    const writes = server()
    renderApp('/settings/api-keys')
    const birthday = await row('Birthday script')

    await userEvent.click(birthday.getByRole('button', { name: 'Revoke' }))
    expect(
      birthday.getByText('Revoke “Birthday script”? Anything using it stops working right away.'),
    ).toBeInTheDocument()
    expect(birthday.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(writes).toEqual([])

    await userEvent.click(birthday.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(birthday.getByRole('button', { name: 'Revoke' }))
    await userEvent.click(birthday.getByRole('button', { name: 'Revoke key' }))

    await waitFor(() =>
      expect(screen.queryByRole('listitem', { name: 'Birthday script' })).not.toBeInTheDocument(),
    )
    expect(writes).toEqual([{ method: 'DELETE', path: '/api/api-keys/k3', body: null }])
  })

  it('deletes an expired key right away', async () => {
    const writes = server()
    renderApp('/settings/api-keys')

    await userEvent.click((await row('Old export job')).getByRole('button', { name: 'Delete' }))

    await waitFor(() =>
      expect(screen.queryByRole('listitem', { name: 'Old export job' })).not.toBeInTheDocument(),
    )
    expect(writes).toEqual([{ method: 'DELETE', path: '/api/api-keys/k4', body: null }])
  })

  it('drops a key revoked elsewhere', async () => {
    server({ revokedElsewhere: true })
    renderApp('/settings/api-keys')
    const birthday = await row('Birthday script')

    await userEvent.click(birthday.getByRole('button', { name: 'Revoke' }))
    await userEvent.click(birthday.getByRole('button', { name: 'Revoke key' }))

    expect(await screen.findByText("Couldn't revoke it")).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('listitem', { name: 'Birthday script' })).not.toBeInTheDocument(),
    )
  })
})
