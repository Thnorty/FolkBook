import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

const ME = { id: 'u1', email: 'ela@example.com', is_admin: false, me: { id: 'me', name: 'Ela' } }
const space = (id: string, name: string, memberCount: number) => ({
  id,
  name,
  color: 'sage',
  description: '',
  share_contact_details: false,
  role: 'owner',
  owner: { id: 'me', name: 'Ela' },
  people_count: 12,
  member_count: memberCount,
})
const CLIMBING = space('s1', 'Climbing club', 0)
const WORK = space('s2', 'Work', 2)
const member = (userId: string, name: string, role: string, isYou = false) => ({
  user_id: userId,
  name,
  email: `${name.toLowerCase()}@example.com`,
  role,
  is_you: isYou,
})

type Write = { method: string; path: string; body: unknown }

function server() {
  const writes: Write[] = []
  const record = async (request: Request) => {
    const body = await request.json()
    writes.push({ method: request.method, path: new URL(request.url).pathname, body })
    return body
  }
  fakeServer({
    'GET /api/auth/me': () => json(ME),
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/spaces': () => json({ items: [CLIMBING, WORK], count: 2 }),
    'GET /api/spaces/s1': () => json(CLIMBING),
    'GET /api/spaces/s1/members': () => json([member('u1', 'Ela', 'owner', true)]),
    'GET /api/spaces/s2/members': () =>
      json([
        member('u1', 'Ela', 'owner', true),
        member('u2', 'Deniz', 'editor'),
        member('u3', 'Kaan', 'viewer'),
      ]),
    'GET /api/spaces/s1/hidden-people': () => json({ items: [], count: 0 }),
    'GET /api/spaces/s1/share-candidates': () =>
      json([{ user_id: 'u4', name: 'Sofia Lind', email: 'sofia@example.com' }]),
    'PATCH /api/spaces/s1': async (request) => json({ ...CLIMBING, ...(await record(request)) }),
    'POST /api/spaces/s1/members': async (request) => {
      await record(request)
      return json(member('u4', 'Sofia Lind', 'editor'), 201)
    },
    'GET /api/people': () => json({ items: [], count: 0 }),
    'GET /api/graph': () => json({ nodes: [], edges: [] }),
  })
  return writes
}

afterEach(() => {
  clearCookies()
  localStorage.clear()
})

describe('sharing a space', () => {
  it('explains what members see, and shares with an account as an editor', async () => {
    const writes = server()
    renderApp('/spaces/s1')

    await userEvent.click(await screen.findByRole('button', { name: 'Share' }))
    const dialog = await screen.findByRole('dialog', { name: 'Share Climbing club' })
    expect(within(dialog).getByText('First time sharing this space')).toBeInTheDocument()
    expect(within(dialog).getByText(/these 12 people's basic profiles/)).toBeInTheDocument()

    await userEvent.type(within(dialog).getByLabelText('Add people on this server'), 'so')
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Add' }))
    await userEvent.selectOptions(within(dialog).getByLabelText("Sofia Lind's role"), 'Editor')
    await userEvent.click(
      within(dialog).getByRole('checkbox', { name: /Also share contact details/ }),
    )
    expect(within(dialog).getByText(/and phone numbers and emails/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Share with 1 person' }))

    expect(await screen.findByText('Climbing club shared with 1 person')).toBeInTheDocument()
    expect(writes).toEqual([
      { method: 'PATCH', path: '/api/spaces/s1', body: { share_contact_details: true } },
      { method: 'POST', path: '/api/spaces/s1/members', body: { user_id: 'u4', role: 'editor' } },
    ])
  })
})

describe('adding someone to a shared space', () => {
  it('asks first, and can stop asking for that space', async () => {
    server()
    renderApp('/people')
    await userEvent.click(await screen.findByRole('button', { name: /Add person/ }))
    const form = await screen.findByRole('dialog', { name: 'Add someone' })
    await userEvent.type(within(form).getByLabelText('Name'), 'Tom Bergqvist')

    await userEvent.click(within(form).getByRole('button', { name: 'Work' }))
    let ask = await screen.findByRole('alertdialog', { name: 'Tom will be visible to 2 people' })
    expect(within(ask).getByText('Deniz')).toBeInTheDocument()
    await userEvent.click(within(ask).getByRole('button', { name: 'Cancel' }))
    expect(within(form).getByRole('button', { name: 'Work' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    await userEvent.click(within(form).getByRole('button', { name: 'Work' }))
    ask = await screen.findByRole('alertdialog')
    await userEvent.click(within(ask).getByRole('checkbox', { name: "Don't ask again for Work" }))
    await userEvent.click(within(ask).getByRole('button', { name: 'Add Tom to Work' }))
    await waitFor(() =>
      expect(within(form).getByRole('button', { name: /Work/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    )

    await userEvent.click(within(form).getByRole('button', { name: /Work/ })) // off
    await userEvent.click(within(form).getByRole('button', { name: /Work/ })) // on, no question
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(within(form).getByRole('button', { name: /Work/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
