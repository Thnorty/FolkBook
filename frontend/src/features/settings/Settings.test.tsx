import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'
import { setAppearance } from '@/lib/appearance'

const ME = {
  id: 'u1',
  email: 'ela@example.com',
  is_admin: false,
  me: { id: 'me', name: 'Ela Demir' },
}
const ELA = {
  id: 'me',
  name: 'Ela Demir',
  how_we_met: '',
  work: '',
  birthday: { day: 3, month: 4, year: null },
  tags: [],
  spaces: [],
  photo: null,
  is_me: true,
  is_mine: true,
  owner: { id: 'me', name: 'Ela Demir' },
  needs_details: false,
  last_talked_on: null,
  added_at: '2026-01-01T00:00:00Z',
  contact_methods: [],
  can_edit: true,
  can_delete: false,
  can_hide: false,
}
const device = (id: string, name: string, isCurrent = false) => ({
  id,
  device: name,
  ip: '10.0.0.1',
  last_seen: '2026-09-22T08:00:00Z',
  is_current: isCurrent,
})

type Write = { method: string; path: string; body: unknown }

function server() {
  const writes: Write[] = []
  let settings = { nudges_on: true, default_interval_days: null as number | null }
  const record = async (request: Request) => {
    const body = ['DELETE'].includes(request.method) ? null : await request.json().catch(() => null)
    writes.push({ method: request.method, path: new URL(request.url).pathname, body })
    return body
  }
  fakeServer({
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/auth/me': () => json(ME),
    'GET /api/people/me': () => json(ELA),
    'GET /api/spaces': () => json({ items: [], count: 0 }),
    'GET /api/people': () => json({ items: [], count: 0 }),
    'GET /api/auth/devices': () =>
      json({
        items: [device('d1', 'Firefox on macOS', true), device('d2', 'Safari on iPhone')],
        count: 2,
      }),
    'DELETE /api/auth/devices/d2': async (request) => {
      await record(request)
      return new Response(null, { status: 204 })
    },
    'POST /api/auth/devices/sign-out-others': async (request) => {
      await record(request)
      return new Response(null, { status: 204 })
    },
    'POST /api/auth/password': async (request) => {
      const body = (await record(request)) as { current_password: string }
      return body.current_password === 'right one'
        ? new Response(null, { status: 204 })
        : json(
            {
              detail: [
                { loc: ['body', 'current_password'], msg: "That's not your current password." },
              ],
            },
            422,
          )
    },
    'GET /api/keep-in-touch/settings': () => json(settings),
    'PUT /api/keep-in-touch/settings': async (request) => {
      settings = (await record(request)) as typeof settings
      return json(settings)
    },
    'GET /api/about': () => json({ version: '0.1.0', source_url: 'https://example.com/folkbook' }),
  })
  return writes
}

const page = (title: string) => screen.findByRole('region', { name: title })

afterEach(() => {
  clearCookies()
  setAppearance({ theme: 'system', motion: 'system' })
})

describe('settings', () => {
  it('shows your account and signs other devices out', async () => {
    const writes = server()
    renderApp('/settings/profile')
    const profile = await page('Profile & account')

    expect(await within(profile).findByText('Ela Demir')).toBeInTheDocument()
    expect(within(profile).getByText(/Birthday .*3/)).toBeInTheDocument()
    expect(within(profile).getByText('ela@example.com')).toBeInTheDocument()
    expect(await within(profile).findByText('This device')).toBeInTheDocument()

    await userEvent.click(within(profile).getByRole('button', { name: 'Sign out' }))
    await userEvent.click(within(profile).getByRole('button', { name: 'Sign out everywhere else' }))

    await waitFor(() => expect(writes).toHaveLength(2))
    expect(writes.map((write) => `${write.method} ${write.path}`)).toEqual([
      'DELETE /api/auth/devices/d2',
      'POST /api/auth/devices/sign-out-others',
    ])
  })

  it('changes the password, and says when the current one is wrong', async () => {
    const writes = server()
    renderApp('/settings/profile')
    const profile = await page('Profile & account')

    await userEvent.click(within(profile).getByRole('button', { name: 'Change password' }))
    await userEvent.type(within(profile).getByLabelText('Current password'), 'wrong one')
    await userEvent.type(within(profile).getByLabelText('New password'), 'a fresh passphrase')
    await userEvent.type(within(profile).getByLabelText('New password again'), 'a fresh passphrase')
    await userEvent.click(within(profile).getByRole('button', { name: 'Save password' }))
    expect(await within(profile).findByRole('alert')).toHaveTextContent(
      "That's not your current password.",
    )

    await userEvent.clear(within(profile).getByLabelText('Current password'))
    await userEvent.type(within(profile).getByLabelText('Current password'), 'right one')
    await userEvent.click(within(profile).getByRole('button', { name: 'Save password' }))

    expect(await screen.findByText('Password changed')).toBeInTheDocument()
    expect(writes.at(-1)).toEqual({
      method: 'POST',
      path: '/api/auth/password',
      body: { current_password: 'right one', new_password: 'a fresh passphrase' },
    })
  })

  it('turns nudges off and sets a default interval', async () => {
    const writes = server()
    renderApp('/settings/reminders')
    const reminders = await page('Reminders')

    await userEvent.click(
      await within(reminders).findByRole('checkbox', { name: 'Show nudges on Today' }),
    )
    await waitFor(() => expect(writes).toHaveLength(1))
    await userEvent.selectOptions(
      within(reminders).getByLabelText('Keep in touch'),
      'Every 2 months',
    )

    await waitFor(() => expect(writes).toHaveLength(2))
    expect(writes.map((write) => write.body)).toEqual([
      { nudges_on: false, default_interval_days: null },
      { nudges_on: false, default_interval_days: 60 },
    ])
  })

  it('picks a theme and reduces motion on this device', async () => {
    server()
    renderApp('/settings/appearance')
    const appearance = await page('Appearance')

    await userEvent.click(
      within(appearance).getByRole('radio', { name: 'Dark: notebook at night' }),
    )
    await userEvent.click(
      within(appearance).getByRole('checkbox', { name: 'Reduce motion on this device' }),
    )

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.dataset.motion).toBe('reduce')
  })

  it('links to the source code, as the AGPL asks', async () => {
    server()
    renderApp('/settings/about')
    const about = await page('About')

    expect(await within(about).findByText('Version 0.1.0')).toBeInTheDocument()
    expect(within(about).getByRole('link', { name: 'Source code' })).toHaveAttribute(
      'href',
      'https://example.com/folkbook',
    )
  })

  it('lists the sections, without the admin ones for members', async () => {
    server()
    renderApp('/settings')

    const nav = await screen.findByRole('navigation', { name: 'Settings' })
    expect(within(nav).getByRole('link', { name: /Appearance/ })).toHaveAttribute(
      'href',
      '/settings/appearance',
    )
    expect(within(nav).queryByText('Server · admin')).not.toBeInTheDocument()
  })

  it.each(['/settings/users', '/settings/invites'])(
    'sends members who open %s back to their own settings',
    async (path) => {
      server()
      const router = renderApp(path)

      await waitFor(() => expect(router.state.location.pathname).toBe('/settings'))
      expect(await screen.findByRole('navigation', { name: 'Settings' })).toBeInTheDocument()
    },
  )
})
