import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { setAppearance } from '@/lib/appearance'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

const ME = { id: 'u1', email: 'ela@example.com', is_admin: false, me: { id: 'me', name: 'Ela' } }

const person = (id: string, name: string, spaces: object[] = []) => ({
  id,
  name,
  how_we_met: '',
  work: '',
  birthday: null,
  tags: [],
  spaces,
  is_me: false,
  is_mine: true,
  owner: { id: 'me', name: 'Ela' },
  photo: null,
  needs_details: true,
  last_talked_on: null,
  pronouns: null,
  added_at: '2026-10-08T10:00:00Z',
  kept: null,
})
const detail = (base: ReturnType<typeof person>, extra: object = {}) => ({
  ...base,
  contact_methods: [],
  can_edit: true,
  can_delete: true,
  can_hide: false,
  from_import: null,
  ...extra,
})
const space = (id: string, name: string, peopleCount: number, memberCount = 0) => ({
  id,
  name,
  color: 'teal',
  description: '',
  share_contact_details: false,
  role: 'owner',
  owner: { id: 'me', name: 'Ela' },
  people_count: peopleCount,
  member_count: memberCount,
})
const SPACES = [
  space('s1', 'Family', 3),
  space('s2', 'Work', 33),
  { ...space('s3', 'Hackathon', 50, 3), role: 'viewer' },
  space('s4', 'Climbing club', 12, 2),
  space('s5', 'Uni', 18),
  space('s6', 'Neighbours', 1),
]
const LARS = person('lars', 'Lars Eriksen')
const GRETA = person('greta', 'Greta Holm')
const CHEN = person('chen', 'Chen Wei')

type Write = { method: string; path: string; body: unknown }

type Person = ReturnType<typeof person>

function server({
  queue = [LARS, GRETA, CHEN],
  count = queue.length,
  gone = '',
}: { queue?: Person[]; count?: number; gone?: string } = {}) {
  const writes: Write[] = []
  const asked: string[] = []
  const record = async (request: Request) => {
    const body = await request.json().catch(() => null)
    writes.push({ method: request.method, path: new URL(request.url).pathname, body })
    return body
  }
  const byId = Object.fromEntries(queue.map((p) => [p.id, p]))
  const routes: Record<string, (request: Request) => Response | Promise<Response>> = {
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/auth/me': () => json(ME),
    'GET /api/spaces': () => json({ items: SPACES, count: SPACES.length }),
    'GET /api/spaces/s4/members': () =>
      json([
        { user_id: 'u1', name: 'Ela', role: 'owner', is_you: true },
        { user_id: 'u2', name: 'Deniz Kaya', role: 'editor', is_you: false },
      ]),
    'GET /api/today/access-ended': () => json([]),
    'GET /api/people': (request) => {
      const url = new URL(request.url)
      if (url.searchParams.get('needs_details') !== 'true') return json({ items: [], count: 0 })
      asked.push(url.search)
      return json({ items: queue, count })
    },
    'POST /api/memory-aids': async (request) => json({ id: 'a1', ...(await record(request)) }),
  }
  for (const p of queue) {
    routes[`GET /api/people/${p.id}`] = () =>
      json(
        detail(
          p,
          p.id === 'lars'
            ? {
                contact_methods: [
                  { id: 'c1', kind: 'phone', label: '', value: '+46 70 222 33 44' },
                ],
                from_import: { id: 'i1', file_name: 'contacts.vcf' },
              }
            : {},
        ),
      )
    routes[`PATCH /api/people/${p.id}`] = async (request) => {
      const body = (await record(request)) as object
      if (p.id === gone) return json({ detail: 'Not Found' }, 404)
      return json(detail({ ...byId[p.id], ...body }))
    }
  }
  fakeServer(routes)
  return { writes, asked }
}

async function open(path = '/people/fill-in') {
  renderApp(path)
  return screen.findByRole('main')
}

const card = () => screen.findByRole('group', { name: /^Fill in/ })

afterEach(() => {
  clearCookies()
  localStorage.clear()
  setAppearance({ theme: 'system', motion: 'system' })
})

describe('fill in the blanks', () => {
  it('asks how you know each person, and saves', async () => {
    const { writes } = server()
    const page = await open()

    expect(await within(page).findByText('1 of 3')).toBeInTheDocument()
    expect(
      await within(page).findByText('From contacts.vcf · +46 70 222 33 44'),
    ).toBeInTheDocument()
    await userEvent.type(within(page).getByLabelText('How do you know Lars?'), 'Stockholm office')
    await userEvent.click(within(page).getByRole('button', { name: 'Save & next' }))

    expect(await within(page).findByText('2 of 3')).toBeInTheDocument()
    expect(within(page).getByLabelText('How do you know Greta?')).toHaveValue('')
    expect(writes).toEqual([
      { method: 'PATCH', path: '/api/people/lars', body: { how_we_met: 'Stockholm office' } },
    ])
  })

  it('puts them in a space from a chip, and adds a memory aid', async () => {
    const { writes } = server()
    const page = await open()
    const answers = within(await card())

    // The four busiest spaces you can add people to, then Friend of…
    expect(
      answers.getAllByRole('checkbox').map((chip) => chip.closest('label')?.textContent),
    ).toEqual([
      expect.stringContaining('Work'),
      expect.stringContaining('Uni'),
      expect.stringContaining('Climbing club'),
      expect.stringContaining('Family'),
    ])
    expect(answers.getByRole('button', { name: /Friend of/ })).toBeInTheDocument()

    await userEvent.click(answers.getByRole('checkbox', { name: /Work/ }))
    await userEvent.click(answers.getByRole('button', { name: '+ add a memory aid' }))
    await userEvent.type(answers.getByLabelText('Memory aid'), 'Kid: Arda')
    await userEvent.click(within(page).getByRole('button', { name: 'Save & next' }))

    await waitFor(() =>
      expect(writes).toEqual([
        { method: 'PATCH', path: '/api/people/lars', body: { space_ids: ['s2'] } },
        {
          method: 'POST',
          path: '/api/memory-aids',
          body: { person_id: 'lars', text: 'Kid: Arda', pinned: false },
        },
      ]),
    )
  })

  it('asks before a shared space', async () => {
    server()
    await open()

    await userEvent.click(within(await card()).getByRole('checkbox', { name: /Climbing club/ }))
    const dialog = await screen.findByRole('alertdialog', { name: /Lars will be visible to/ })
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Don.t ask again/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: /Add Lars/ }))
    expect(within(await card()).getByRole('checkbox', { name: /Climbing club/ })).toBeChecked()

    await userEvent.click(screen.getByRole('button', { name: 'Skip' }))
    await screen.findByText('2 of 3')
    await userEvent.click(within(await card()).getByRole('checkbox', { name: /Climbing club/ }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('opens the connect form for Friend of…', async () => {
    server()
    await open()

    await userEvent.click(within(await card()).getByRole('button', { name: /Friend of/ }))

    const dialog = await screen.findByRole('dialog', { name: 'Connect Lars to…' })
    expect(await within(dialog).findByRole('radio', { name: /Friend/ })).toBeChecked()
  })

  it('works with the keyboard', async () => {
    const { writes } = server()
    const page = await open()
    await within(page).findByText('1 of 3')

    fireEvent.keyDown(window, { key: 'ArrowRight', ctrlKey: true })
    expect(await within(page).findByText('2 of 3')).toBeInTheDocument()
    await within(page).findByLabelText('How do you know Greta?')

    fireEvent.keyDown(window, { key: '1' })
    expect(within(await card()).getByRole('checkbox', { name: /Work/ })).toBeChecked()
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })

    await waitFor(() =>
      expect(writes).toEqual([
        { method: 'PATCH', path: '/api/people/greta', body: { space_ids: ['s2'] } },
      ]),
    )
  })

  it('types digits in the text field', async () => {
    server()
    const page = await open()

    await userEvent.type(
      await within(page).findByLabelText('How do you know Lars?'),
      'Class of 1990',
    )

    expect(within(await card()).getByRole('checkbox', { name: /Work/ })).not.toBeChecked()
    expect(within(page).getByLabelText('How do you know Lars?')).toHaveValue('Class of 1990')
  })

  it("shows who's next", async () => {
    server()
    const page = await open()
    const list = await within(page).findByRole('list', { name: "Who's next" })

    expect(within(list).getByText('Lars Eriksen').closest('li')).toHaveTextContent('Now')
    await userEvent.type(within(page).getByLabelText('How do you know Lars?'), 'Work')
    await userEvent.click(within(page).getByRole('button', { name: 'Save & next' }))

    await waitFor(() =>
      expect(within(list).getByText('Lars Eriksen').closest('li')).toHaveTextContent('Done'),
    )
    expect(within(list).getByText('Greta Holm').closest('li')).toHaveTextContent('Now')
    expect(within(page).getByRole('link', { name: 'Finish later' })).toHaveAttribute(
      'href',
      '/people',
    )
  })

  it('says all done at the end, and keeps skipped people for next time', async () => {
    const { asked } = server({ queue: [LARS] })
    const page = await open()
    await within(page).findByText('1 of 1')

    await userEvent.click(within(page).getByRole('button', { name: 'Skip' }))

    expect(await within(page).findByText('All done')).toBeInTheDocument()
    expect(asked).toHaveLength(1) // the queue is read once
  })

  it('moves on when someone is gone', async () => {
    server({ gone: 'lars' })
    const page = await open()

    await userEvent.type(await within(page).findByLabelText('How do you know Lars?'), 'Work')
    await userEvent.click(within(page).getByRole('button', { name: 'Save & next' }))

    expect(await screen.findByText("Lars Eriksen isn't in your book any more")).toBeInTheDocument()
    expect(await within(page).findByText('2 of 3')).toBeInTheDocument()
  })

  it('offers to keep going after a full page', async () => {
    const { asked } = server({ queue: [LARS], count: 3 })
    const page = await open()

    await userEvent.click(await within(page).findByRole('button', { name: 'Skip' }))

    expect(await within(page).findByText('2 more need details')).toBeInTheDocument()
    await userEvent.click(within(page).getByRole('button', { name: 'Keep going' }))
    await waitFor(() => expect(asked).toHaveLength(2))
  })

  it("fills in an import's people only", async () => {
    const { asked } = server()
    await open('/people/fill-in?import=i1')

    await screen.findByText('1 of 3')
    expect(asked[0]).toContain('import=i1')
  })

  it('swipes on phones, and not with reduced motion', async () => {
    server()
    await open()
    expect(await screen.findByText('Swipe to save →')).toBeInTheDocument()
    expect(screen.getByText('← Swipe to skip')).toBeInTheDocument()

    setAppearance({ motion: 'reduce' })

    await waitFor(() => expect(screen.queryByText('Swipe to save →')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Save & next' })).toBeInTheDocument()
  })
})
