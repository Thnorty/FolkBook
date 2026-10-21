import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

const ME = { id: 'u1', email: 'ela@example.com', is_admin: false, me: { id: 'me', name: 'Ela' } }
const HOUR = 60 * 60 * 1000
const CLIMBING = { id: 's1', name: 'Climbing club' }
const space = (ref: { id: string; name: string }) => ({
  ...ref,
  color: 'sage',
  description: '',
  share_contact_details: false,
  role: 'owner',
  owner: { id: 'me', name: 'Ela' },
  people_count: 3,
  member_count: 0,
})
const feed = (id: string, name: string, extra = {}) => ({
  id,
  name,
  last_five: `${id}x42`,
  limited: false,
  spaces: [],
  last_fetched_at: null,
  created_at: '2026-10-01T09:00:00Z',
  ...extra,
})
const FEED_URL =
  'http://localhost:8080/api/calendars/feed/fb_cal_7Qm2kP9xV4rT8nL1wZ6cB3hJ5sD0fG2a.ics'

type Write = { method: string; path: string; body: unknown }

function server(initial: ReturnType<typeof feed>[] = []) {
  const writes: Write[] = []
  let feeds = [...initial]
  const routes: Parameters<typeof fakeServer>[0] = {
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/auth/me': () => json(ME),
    'GET /api/spaces': () => json({ items: [space(CLIMBING)], count: 1 }),
    'GET /api/people': () => json({ items: [], count: 0 }),
    'GET /api/calendars': () => json({ items: feeds, count: feeds.length }),
    'POST /api/calendars': async (request) => {
      const body = (await request.json()) as { name: string; space_ids: string[] | null }
      writes.push({ method: 'POST', path: '/api/calendars', body })
      const created = feed('f9', body.name, {
        limited: body.space_ids !== null,
        spaces: [CLIMBING].filter((ref) => body.space_ids?.includes(ref.id)),
      })
      feeds = [created, ...feeds]
      return json({ ...created, url: FEED_URL }, 201)
    },
  }
  for (const { id } of initial) {
    routes[`DELETE /api/calendars/${id}`] = (request) => {
      writes.push({ method: 'DELETE', path: new URL(request.url).pathname, body: null })
      feeds = feeds.filter((each) => each.id !== id)
      return new Response(null, { status: 204 })
    }
  }
  fakeServer(routes)
  return writes
}

const page = () => screen.findByRole('region', { name: 'Calendar' })
const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(within(await page()).getByRole('button', { name: '+ New calendar link' }))
  return within(await screen.findByRole('dialog', { name: 'New calendar link' }))
}
const savedIt = async (user: ReturnType<typeof userEvent.setup>) => {
  const created = within(await screen.findByRole('dialog', { name: 'Calendar link created' }))
  const button = created.getByRole('button', { name: "I've added it" })
  await waitFor(() => expect(button).toBeEnabled())
  await user.click(button)
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
}

afterEach(clearCookies)

describe('Settings → Calendar', () => {
  it('says what calendar links are for when there are none', async () => {
    server()
    renderApp('/settings/calendar')

    const settings = await page()
    expect(
      within(settings).getByText(/Birthdays in the calendar app you already use\./),
    ).toBeInTheDocument()
    expect(
      within(settings).getByRole('button', { name: '+ New calendar link' }),
    ).toBeInTheDocument()
  })

  it('shows the section after Reminders', async () => {
    server()
    renderApp('/settings/calendar')

    const nav = await screen.findByRole('navigation', { name: 'Settings' })
    const labels = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent)
    expect(labels.indexOf('Calendar')).toBe(labels.indexOf('Reminders') + 1)
  })

  it('creates a link and shows it once, with copy and webcal', async () => {
    const user = userEvent.setup()
    const writes = server()
    renderApp('/settings/calendar')
    const dialog = await open(user)

    await user.type(dialog.getByLabelText('Name'), 'Family')
    await user.click(dialog.getByRole('button', { name: 'Create link' }))

    const created = within(await screen.findByRole('dialog', { name: 'Calendar link created' }))
    expect(writes).toEqual([
      { method: 'POST', path: '/api/calendars', body: { name: 'Family', space_ids: null } },
    ])
    expect(created.getByRole('textbox', { name: 'Calendar link' })).toHaveValue(FEED_URL)
    expect(created.getByRole('button', { name: 'Copy' })).toBeVisible()
    expect(created.getByRole('link', { name: 'Open in your calendar app' })).toHaveAttribute(
      'href',
      FEED_URL.replace('http://', 'webcal://'),
    )
    expect(
      created.getByText('Google Calendar: Other calendars → From URL, then paste the link.'),
    ).toBeVisible()
    expect(created.getByText(/You won't see this link again\./)).toBeVisible()

    await savedIt(user)
    const row = within(await screen.findByRole('listitem', { name: 'Family' }))
    expect(row.getByText('Everyone you can see')).toBeVisible()
    expect(screen.queryByDisplayValue(FEED_URL)).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('fb_cal_7Qm2')
  })

  it('limits a link to chosen spaces', async () => {
    const user = userEvent.setup()
    const writes = server()
    renderApp('/settings/calendar')
    const dialog = await open(user)

    await user.type(dialog.getByLabelText('Name'), 'Climbing')
    await user.click(await dialog.findByRole('checkbox', { name: /Climbing club/ }))
    await user.click(dialog.getByRole('button', { name: 'Create link' }))
    await savedIt(user)

    expect(writes[0].body).toEqual({ name: 'Climbing', space_ids: ['s1'] })
    const row = within(await screen.findByRole('listitem', { name: 'Climbing' }))
    expect(row.getByText('Climbing club')).toBeVisible()
  })

  it('shows when a calendar last asked', async () => {
    server([
      feed('f1', 'Phone', { last_fetched_at: new Date(Date.now() - 2 * HOUR).toISOString() }),
      feed('f2', 'Laptop'),
    ])
    renderApp('/settings/calendar')

    const phone = within(await screen.findByRole('listitem', { name: 'Phone' }))
    expect(phone.getByText(/Last used/)).toHaveTextContent(/2 hours ago/)
    const laptop = within(screen.getByRole('listitem', { name: 'Laptop' }))
    expect(laptop.getByText('Not used yet')).toBeVisible()
  })

  it('revokes a link after asking in place', async () => {
    const user = userEvent.setup()
    const writes = server([feed('f1', 'Family')])
    renderApp('/settings/calendar')
    const row = within(await screen.findByRole('listitem', { name: 'Family' }))

    await user.click(row.getByRole('button', { name: 'Revoke' }))
    expect(row.getByText(/Calendars using this link stop updating\./)).toBeVisible()
    await user.click(row.getByRole('button', { name: 'Revoke link' }))

    await waitFor(() =>
      expect(screen.queryByRole('listitem', { name: 'Family' })).not.toBeInTheDocument(),
    )
    expect(writes).toEqual([{ method: 'DELETE', path: '/api/calendars/f1', body: null }])
  })
})
