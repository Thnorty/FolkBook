import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

const ME = { id: 'u1', email: 'ela@example.com', is_admin: false, me: { id: 'me', name: 'Ela' } }
const ref = (id: string, name: string) => ({ id, name })
const FRIENDS = { id: 's1', name: 'Friends', color: 'sage' }

const EMMA = {
  id: 'emma',
  name: 'Emma Yılmaz',
  how_we_met: '',
  work: '',
  birthday: null,
  tags: [],
  spaces: [FRIENDS],
  photo: null,
  is_me: false,
  is_mine: true,
  owner: ref('me', 'Ela'),
  needs_details: false,
  last_talked_on: null,
  contact_methods: [],
  can_edit: true,
  can_delete: true,
}

const PARTNERS = {
  id: 'l1',
  person_a: ref('emma', 'Emma Yılmaz'),
  person_b: ref('kerem', 'Kerem Yılmaz'),
  type: 'partner',
  parent_type: null,
  label: '',
  started_on: null,
  ended_on: null,
  is_former: false,
  space: null,
  is_mine: true,
}

type Overrides = Record<string, (request: Request) => Response | Promise<Response>>

function server(overrides: Overrides = {}) {
  const writes: string[] = []
  const write =
    (status: number, body: unknown = null) =>
    (request: Request) => {
      writes.push(`${request.method} ${new URL(request.url).pathname}`)
      return body === null ? new Response(null, { status }) : json(body, status)
    }
  const page = (items: unknown[]) => () => json({ items, count: items.length })

  fakeServer({
    'GET /api/auth/me': () => json(ME),
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/spaces': page([
      {
        ...FRIENDS,
        description: '',
        share_contact_details: false,
        role: 'editor',
        owner: ref('defne', 'Defne'),
        people_count: 4,
        member_count: 3, // you and two others
      },
    ]),
    'GET /api/spaces/s1/members': () =>
      json([
        {
          user_id: 'u-defne',
          name: 'Defne Aydın',
          email: 'd@x.test',
          role: 'owner',
          is_you: false,
        },
        { user_id: 'u-ela', name: 'Ela', email: 'e@x.test', role: 'editor', is_you: true },
        { user_id: 'u-ola', name: 'Ola Nowak', email: 'o@x.test', role: 'viewer', is_you: false },
        { user_id: 'u-jin', name: 'Jin Park', email: 'j@x.test', role: 'viewer', is_you: false },
      ]),
    'GET /api/people': page([]),
    'GET /api/people/emma': () => json(EMMA),
    'GET /api/people/emma/family': () => json([]),
    'GET /api/relationships': (request) =>
      new URL(request.url).searchParams.get('family') === 'true'
        ? json({ items: [PARTNERS], count: 1 })
        : json({ items: [], count: 0 }),
    'GET /api/memory-aids': page([
      { id: 'a1', person_id: 'emma', text: 'Kid: Arda', pinned: false, position: 0 },
    ]),
    'GET /api/people/emma/note': () => json({ body: 'Moving to Izmir.', updated_at: null }),
    'GET /api/interactions': () => json({ items: [], count: 2 }),
    'GET /api/keep-in-touch/emma': () =>
      json({ interval_days: null, snoozed_until: null, stopped: false }),
    'DELETE /api/people/emma': write(204),
    'POST /api/people/emma/restore': write(200, EMMA),
    'POST /api/people/emma/hide': write(204),
    'POST /api/people/emma/unhide': write(200, EMMA),
    ...overrides,
  })
  return writes
}

async function openTearOut() {
  const router = renderApp('/people/emma')
  await userEvent.click(await screen.findByRole('button', { name: 'More' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Tear out of the book…' }))
  return {
    router,
    dialog: await screen.findByRole('alertdialog', { name: 'Tear Emma out of the book?' }),
  }
}

afterEach(clearCookies)

describe('tearing someone out of the book', () => {
  it('says what goes with them, tears them out, and Undo brings them back', async () => {
    const writes = server()
    const { router, dialog } = await openTearOut()

    expect(within(dialog).getByText('1 connection: Kerem Yılmaz')).toBeInTheDocument()
    expect(
      within(dialog).getByText('1 memory aid, 2 timeline entries and your note'),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('Leaves the Friends space')).toBeInTheDocument()
    expect(
      await within(dialog).findByText(
        /Defne Aydın, Ola Nowak and Jin Park will no longer see Emma there/,
      ),
    ).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Tear out' }))

    expect(await screen.findByText('Emma Yılmaz torn out')).toBeInTheDocument()
    expect(screen.getByText('1 connection and 1 memory aid went with them.')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe('/people'))

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByText('Emma is back')).toBeInTheDocument()
    expect(writes).toEqual(['DELETE /api/people/emma', 'POST /api/people/emma/restore'])
  })

  it('keeps them when you change your mind', async () => {
    const writes = server()
    const { router, dialog } = await openTearOut()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep' }))

    expect(writes).toEqual([])
    expect(router.state.location.pathname).toBe('/people/emma')
  })

  it('stays on their page if the delete fails', async () => {
    server({ 'DELETE /api/people/emma': () => json({ detail: 'Only the owner can delete.' }, 403) })
    const { router, dialog } = await openTearOut()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Tear out' }))

    expect(await screen.findByText("Couldn't take Emma out")).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/people/emma')
  })

  it('takes someone shared with you out of your book, and Undo adds them back', async () => {
    const shared = {
      ...EMMA,
      is_mine: false,
      owner: ref('defne', 'Defne Aydın'),
      can_edit: false,
      can_delete: false,
      can_hide: true,
    }
    const writes = server({ 'GET /api/people/emma': () => json(shared) })
    const router = renderApp('/people/emma')

    await userEvent.click(await screen.findByRole('button', { name: 'More' }))
    expect(screen.queryByRole('menuitem', { name: /Tear out/ })).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove from my book…' }))
    const dialog = await screen.findByRole('alertdialog', { name: "Emma isn't yours to delete" })
    expect(within(dialog).getByText(/Defne keeps Emma/)).toBeInTheDocument()
    expect(within(dialog).getByText('You can add Emma back from Friends')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove from my book' }))

    expect(await screen.findByText('Emma Yılmaz removed from your book')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe('/people'))
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByText('Emma is back')).toBeInTheDocument()
    expect(writes).toEqual(['POST /api/people/emma/hide', 'POST /api/people/emma/unhide'])
  })

  it("isn't offered for someone you can't delete or take out", async () => {
    server({ 'GET /api/people/emma': () => json({ ...EMMA, can_delete: false }) })
    renderApp('/people/emma')
    await screen.findByRole('heading', { level: 1, name: 'Emma Yılmaz' })

    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument()
  })
})
