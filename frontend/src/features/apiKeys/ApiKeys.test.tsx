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

const KEY = 'fb_live_7Qm2kP9xV4rT8nL1wZ6cB3hJ5sD0fG2a'
type KeyIn = {
  name: string
  read_only: boolean
  include_private: boolean
  space_ids: string[] | null
  expires_in: string
}

function server({
  keys: initial = KEYS,
  deleteStatus = 204,
  createWait,
}: {
  keys?: typeof KEYS
  /** What DELETE answers, e.g. 404 when the key was revoked on another device. */
  deleteStatus?: number
  /** Holds the create call's answer back until this settles. */
  createWait?: Promise<void>
} = {}) {
  const writes: Write[] = []
  let keys = [...initial]
  const routes: Parameters<typeof fakeServer>[0] = {
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/auth/me': () => json(ME),
    'GET /api/spaces': () =>
      json({ items: [space(FRIENDS, 'sage'), space(FAMILY, 'clay')], count: 2 }),
    'GET /api/people': () => json({ items: [], count: 0 }),
    'GET /api/api-keys': () => json({ items: keys, count: keys.length }),
    'POST /api/api-keys': async (request) => {
      const body = (await request.json()) as KeyIn
      writes.push({ method: 'POST', path: '/api/api-keys', body })
      await createWait
      // As the real API: the schema wants at least a character, then the service trims.
      if (!body.name) {
        const msg = 'String should have at least 1 character'
        return json({ detail: [{ loc: ['body', 'data', 'name'], msg }] }, 422)
      }
      if (!body.name.trim()) {
        return json({ detail: [{ loc: ['body', 'name'], msg: 'Give the key a name.' }] }, 422)
      }
      const created = apiKey('k9', body.name, {
        last_five: 'f0G2a',
        read_only: body.read_only,
        include_private: body.include_private,
        limited: body.space_ids !== null,
        spaces: [FRIENDS, FAMILY].filter((ref) => body.space_ids?.includes(ref.id)),
        expires_at: body.expires_in === 'never' ? null : '2027-09-22T10:00:00Z',
      })
      keys = [created, ...keys]
      return json({ ...created, key: KEY }, 201)
    },
  }
  for (const { id } of initial) {
    routes[`DELETE /api/api-keys/${id}`] = (request) => {
      writes.push({ method: 'DELETE', path: new URL(request.url).pathname, body: null })
      if (deleteStatus >= 500) return json({ detail: 'Server error' }, deleteStatus)
      const there = keys.some((key) => key.id === id)
      keys = keys.filter((key) => key.id !== id)
      return there && deleteStatus === 204
        ? new Response(null, { status: 204 })
        : json({ detail: 'Not Found' }, 404)
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
    // Phone cards have no column heads (and screen readers never hear them): each value says
    // what it is.
    expect(home.getByText(/2 hours ago/)).toHaveTextContent(/^Used\s*2 hours ago$/)
    expect(home.getByText('All spaces')).toBeInTheDocument()
    expect(home.getByText('Never')).toHaveTextContent(/^Expires\s*Never$/)
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
    expect(birthday.getByRole('button', { name: 'Revoke' })).toHaveFocus()
    await userEvent.click(birthday.getByRole('button', { name: 'Revoke' }))
    await userEvent.click(birthday.getByRole('button', { name: 'Revoke key' }))

    await waitFor(() =>
      expect(screen.queryByRole('listitem', { name: 'Birthday script' })).not.toBeInTheDocument(),
    )
    expect(writes).toEqual([{ method: 'DELETE', path: '/api/api-keys/k3', body: null }])
    // Focus stays where it was: on the next key.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus())
  })

  it('moves focus to Create key once the last key is gone', async () => {
    server({ keys: [KEYS[3]] })
    renderApp('/settings/api-keys')

    await userEvent.click((await row('Old export job')).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.getByRole('button', { name: '+ Create key' })).toHaveFocus())
  })

  it('revokes once on a double click', async () => {
    const writes = server()
    renderApp('/settings/api-keys')
    const birthday = await row('Birthday script')

    await userEvent.click(birthday.getByRole('button', { name: 'Revoke' }))
    await userEvent.dblClick(birthday.getByRole('button', { name: 'Revoke key' }))

    await waitFor(() =>
      expect(screen.queryByRole('listitem', { name: 'Birthday script' })).not.toBeInTheDocument(),
    )
    expect(writes).toHaveLength(1)
    expect(screen.queryByText("Couldn't revoke it")).not.toBeInTheDocument()
  })

  it('says when deleting fails, and keeps the key', async () => {
    server({ deleteStatus: 500 })
    renderApp('/settings/api-keys')

    await userEvent.click((await row('Old export job')).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText("Couldn't delete it")).toBeInTheDocument()
    expect(await row('Old export job')).toBeTruthy()
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
    server({ deleteStatus: 404 })
    renderApp('/settings/api-keys')
    const birthday = await row('Birthday script')

    await userEvent.click(birthday.getByRole('button', { name: 'Revoke' }))
    await userEvent.click(birthday.getByRole('button', { name: 'Revoke key' }))

    expect(await screen.findByText('That key was already revoked')).toBeInTheDocument()
    expect(screen.queryByText("Couldn't revoke it")).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('listitem', { name: 'Birthday script' })).not.toBeInTheDocument(),
    )
  })
})

describe('creating an API key', () => {
  const open = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(within(await page()).getByRole('button', { name: '+ Create key' }))
    return within(await screen.findByRole('dialog', { name: 'Create API key' }))
  }
  const posted = (writes: Write[]) => writes.filter((write) => write.method === 'POST')
  // "I've saved it" waits a moment, so the press that made the key can't also close it.
  const saveIt = async (
    user: ReturnType<typeof userEvent.setup>,
    created: ReturnType<typeof within>,
  ) => {
    const button = created.getByRole('button', { name: "I've saved it" })
    await waitFor(() => expect(button).toBeEnabled())
    await user.click(button)
  }
  const createdDialog = async () =>
    within(await screen.findByRole('dialog', { name: 'Key created' }))

  it('creates a read-only key for all spaces by default', async () => {
    const user = userEvent.setup()
    const writes = server({ keys: [] })
    renderApp('/settings/api-keys')
    const dialog = await open(user)

    await user.type(dialog.getByLabelText('Name'), 'Home Assistant')
    await user.click(dialog.getByRole('button', { name: 'Create key' }))

    await createdDialog()
    expect(posted(writes).map((write) => write.body)).toEqual([
      {
        name: 'Home Assistant',
        read_only: true,
        include_private: false,
        space_ids: null,
        expires_in: '90d',
      },
    ])
  })

  it.each([
    ['1 year', '1y'],
    ['Never', 'never'],
  ])('creates a key with each choice (%s)', async (label, expiresIn) => {
    const user = userEvent.setup()
    const writes = server({ keys: [] })
    renderApp('/settings/api-keys')
    const dialog = await open(user)

    await user.type(dialog.getByLabelText('Name'), 'Obsidian sync')
    await user.click(dialog.getByRole('radio', { name: /Read-write/ }))
    await user.click(await dialog.findByRole('checkbox', { name: /Friends/ }))
    await user.click(dialog.getByRole('checkbox', { name: /Family/ }))
    await user.click(
      dialog.getByRole('checkbox', { name: /Include my private notes, memory aids and timeline/ }),
    )
    await user.click(dialog.getByRole('radio', { name: label }))
    await user.click(dialog.getByRole('button', { name: 'Create key' }))

    await createdDialog()
    expect(posted(writes).map((write) => write.body)).toEqual([
      {
        name: 'Obsidian sync',
        read_only: false,
        include_private: true,
        space_ids: ['s1', 's2'],
        expires_in: expiresIn,
      },
    ])
  })

  it('goes back to all spaces when no space is ticked', async () => {
    const user = userEvent.setup()
    const writes = server({ keys: [] })
    renderApp('/settings/api-keys')
    const dialog = await open(user)
    const all = dialog.getByRole('checkbox', { name: /All spaces/ })
    const friends = await dialog.findByRole('checkbox', { name: /Friends/ })
    expect(all).toBeChecked()

    await user.click(friends)
    expect(all).not.toBeChecked()
    await user.click(friends)
    expect(all).toBeChecked()
    await user.click(friends)
    await user.click(all)
    expect(friends).not.toBeChecked()
    expect(all).toBeChecked()

    await user.type(dialog.getByLabelText('Name'), 'Script')
    await user.click(dialog.getByRole('button', { name: 'Create key' }))
    await createdDialog()
    expect(posted(writes)[0].body).toMatchObject({ space_ids: null })
  })

  it('shows the key once, and copies it', async () => {
    const user = userEvent.setup()
    server({ keys: [] })
    renderApp('/settings/api-keys')
    const dialog = await open(user)
    await user.type(dialog.getByLabelText('Name'), 'Obsidian sync')
    await user.click(dialog.getByRole('radio', { name: /Read-write/ }))
    await user.click(await dialog.findByRole('checkbox', { name: /Friends/ }))
    await user.click(dialog.getByRole('checkbox', { name: /Family/ }))
    await user.click(dialog.getByRole('checkbox', { name: /Include my private notes/ }))
    await user.click(dialog.getByRole('button', { name: 'Create key' }))

    const created = await createdDialog()
    expect(created.getByText("Copy it now — you won't see it again.")).toBeInTheDocument()
    expect(created.getByText(/If you lose it, revoke it and make a new one\./)).toBeInTheDocument()
    expect(
      created.getByText('Obsidian sync · read-write + private notes · Friends, Family'),
    ).toBeInTheDocument()
    expect(created.getByRole('textbox', { name: 'API key' })).toHaveValue(KEY)
    expect(created.getByText(`Expires ${formatDay('2027-09-22')}.`, { exact: false })).toBeVisible()
    expect(created.getByText('Authorization: Bearer …')).toBeInTheDocument()

    await user.click(created.getByRole('button', { name: 'Copy' }))
    expect(await created.findByRole('button', { name: 'Copied ✓' })).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toBe(KEY)

    await saveIt(user, created)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await row('Obsidian sync')).toBeTruthy()
  })

  it('says when a key never expires', async () => {
    const user = userEvent.setup()
    server({ keys: [] })
    renderApp('/settings/api-keys')
    const dialog = await open(user)
    await user.type(dialog.getByLabelText('Name'), 'Home Assistant')
    await user.click(dialog.getByRole('radio', { name: 'Never' }))
    await user.click(dialog.getByRole('button', { name: 'Create key' }))

    const created = await createdDialog()
    expect(created.getByText('Home Assistant · read-only · All spaces')).toBeInTheDocument()
    expect(created.getByText('Never expires.', { exact: false })).toBeVisible()
  })

  it('forgets the key once closed', async () => {
    const user = userEvent.setup()
    server({ keys: [] })
    const router = renderApp('/settings/api-keys')
    const dialog = await open(user)
    await user.type(dialog.getByLabelText('Name'), 'Script')
    await user.click(dialog.getByRole('button', { name: 'Create key' }))

    await saveIt(user, await createdDialog())
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await row('Script')

    const { queryClient } = router.options.context
    const cached = JSON.stringify([
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data),
      queryClient
        .getMutationCache()
        .getAll()
        .map((mutation) => mutation.state.data),
    ])
    expect(cached).not.toContain(KEY)
    const again = await open(user)
    expect(again.getByLabelText('Name')).toHaveValue('')
    expect(screen.queryByDisplayValue(KEY)).not.toBeInTheDocument()
  })

  it('makes one key from two quick submits', async () => {
    const user = userEvent.setup()
    let answer = () => {}
    const writes = server({ keys: [], createWait: new Promise((done) => (answer = done)) })
    renderApp('/settings/api-keys')
    const dialog = await open(user)
    await user.type(dialog.getByLabelText('Name'), 'Script')

    await user.keyboard('{Control>}{Enter}{/Control}')
    await user.keyboard('{Control>}{Enter}{/Control}')
    answer()

    await createdDialog()
    expect(posted(writes)).toHaveLength(1)
  })

  it("shows the server's answer to a blank name", async () => {
    const user = userEvent.setup()
    const writes = server({ keys: [] })
    renderApp('/settings/api-keys')
    const dialog = await open(user)

    await user.type(dialog.getByLabelText('Name'), '   ')
    await user.click(dialog.getByRole('button', { name: 'Create key' }))

    expect(await dialog.findByText('Give the key a name.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Create API key' })).toBeInTheDocument()
    // Sent as typed: the server trims, and only it says why the name won't do.
    expect(posted(writes)[0].body).toMatchObject({ name: '   ' })
  })

  it('keeps the key on screen after a second quick press', async () => {
    // The key came back between two presses of Ctrl/⌘+Enter (or a double tap on phones,
    // where "I've saved it" sits where "Create key" was).
    const user = userEvent.setup()
    server({ keys: [] })
    renderApp('/settings/api-keys')
    const dialog = await open(user)
    await user.type(dialog.getByLabelText('Name'), 'Script')

    await user.keyboard('{Control>}{Enter}{/Control}')
    const created = await createdDialog()
    await user.keyboard('{Control>}{Enter}{/Control}')
    await user.click(created.getByRole('button', { name: "I've saved it" }))

    expect(screen.getByRole('dialog', { name: 'Key created' })).toBeInTheDocument()
    await saveIt(user, created)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('keeps the key on screen after a tap outside it', async () => {
    // Radix makes the page behind a dialog unclickable; the tap still reaches the document.
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    server({ keys: [] })
    renderApp('/settings/api-keys')
    const dialog = await open(user)
    await user.type(dialog.getByLabelText('Name'), 'Script')
    await user.click(dialog.getByRole('button', { name: 'Create key' }))
    await createdDialog()

    await user.click(document.body)

    expect(screen.getByRole('dialog', { name: 'Key created' })).toBeInTheDocument()
  })
})
