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
  gone = '',
  spacesOf = {},
  slowSave,
}: {
  queue?: Person[]
  gone?: string
  /** What a person's details say their spaces are now (the queue may be older). */
  spacesOf?: Record<string, object[]>
  /** A save that waits for this before answering. */
  slowSave?: Promise<void>
} = {}) {
  const writes: Write[] = []
  const asked: URLSearchParams[] = []
  const saved = new Set<string>()
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
      const query = new URL(request.url).searchParams
      if (query.get('needs_details') !== 'true') return json({ items: [], count: 0 })
      asked.push(query)
      if (query.get('import') === 'bad') {
        return json({ detail: [{ loc: ['query', 'import'], msg: 'Not a valid id.' }] }, 422)
      }
      // Pages of 50, like the API; people saved since no longer need details.
      const left = queue.filter((p) => !saved.has(p.id))
      const page = Number(query.get('page') ?? 1)
      return json({ items: left.slice((page - 1) * 50, page * 50), count: left.length })
    },
    'POST /api/memory-aids': async (request) => json({ id: 'a1', ...(await record(request)) }),
  }
  for (const p of queue) {
    routes[`GET /api/people/${p.id}`] = () =>
      json(
        detail(p, {
          ...(p.id === 'lars' && {
            contact_methods: [{ id: 'c1', kind: 'phone', label: '', value: '+46 70 222 33 44' }],
            from_import: { id: 'i1', file_name: 'contacts.vcf' },
          }),
          ...(spacesOf[p.id] && { spaces: spacesOf[p.id] }),
        }),
      )
    routes[`PATCH /api/people/${p.id}`] = async (request) => {
      const body = (await record(request)) as object
      if (slowSave) await slowSave
      if (p.id === gone) return json({ detail: 'Not Found' }, 404)
      saved.add(p.id)
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
      '/people?needs=true',
    )
  })

  it('says all done at the end, and keeps skipped people for next time', async () => {
    const { asked, writes } = server({ queue: [LARS] })
    const page = await open()
    await within(page).findByText('1 of 1')

    await userEvent.click(within(page).getByRole('button', { name: 'Skip' }))

    expect(await within(page).findByText('All done')).toBeInTheDocument()
    expect(asked).toHaveLength(1) // the queue is read once
    expect(writes).toEqual([]) // skipping changes nothing: they still need details
  })

  it('moves on when someone is gone', async () => {
    server({ gone: 'lars' })
    const page = await open()

    await userEvent.type(await within(page).findByLabelText('How do you know Lars?'), 'Work')
    await userEvent.click(within(page).getByRole('button', { name: 'Save & next' }))

    expect(await screen.findByText("Lars Eriksen isn't in your book any more")).toBeInTheDocument()
    expect(await within(page).findByText('2 of 3')).toBeInTheDocument()
  })

  it('offers to keep going after a full page, past the people you skipped', async () => {
    const many = Array.from({ length: 52 }, (_, i) =>
      person(`p${i + 1}`, `Person ${String(i + 1).padStart(2, '0')}`),
    )
    const { asked } = server({ queue: many })
    const page = await open()
    for (let i = 1; i <= 50; i++) {
      await within(page).findByText(`${i} of 50`)
      fireEvent.click(within(page).getByRole('button', { name: 'Skip' }))
    }

    expect(await within(page).findByText('2 more need details')).toBeInTheDocument()
    await userEvent.click(within(page).getByRole('button', { name: 'Keep going' }))

    expect(await within(page).findByText('1 of 2')).toBeInTheDocument()
    expect(await within(page).findByLabelText('How do you know Person?')).toBeInTheDocument()
    const list = within(page).getByRole('list', { name: "Who's next" })
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([expect.stringContaining('Person 51'), expect.stringContaining('Person 52')])
    expect(asked.map((query) => query.get('page'))).toEqual(['1', '2'])
  })

  it("fills in an import's people only", async () => {
    const { asked } = server()
    await open('/people/fill-in?import=i1')

    await screen.findByText('1 of 3')
    expect(asked[0].get('import')).toBe('i1')
    expect(asked[0].get('mine')).toBe('true')
    expect(screen.getByText('3 from your import')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Finish later' })).toHaveAttribute('href', '/people')
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

  it('leaves Ctrl+→ to the text field, so typing never skips', async () => {
    const { writes } = server()
    const page = await open()
    const field = await within(page).findByLabelText('How do you know Lars?')
    await userEvent.type(field, 'Stockholm')

    fireEvent.keyDown(field, { key: 'ArrowRight', ctrlKey: true })

    expect(within(page).getByText('1 of 3')).toBeInTheDocument()
    expect(field).toHaveValue('Stockholm')
    expect(writes).toEqual([])
  })

  it("doesn't pick chips behind an open dialog", async () => {
    server()
    await open()
    await userEvent.click(within(await card()).getByRole('button', { name: /Friend of/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Connect Lars to…' })

    fireEvent.keyDown(within(dialog).getAllByRole('button')[0], { key: '1' })

    // The card is hidden from assistive tech while the dialog is open.
    const behind = screen.getByRole('group', { name: /^Fill in/, hidden: true })
    expect(within(behind).getByRole('checkbox', { name: /Work/, hidden: true })).not.toBeChecked()
  })

  it("can't skip while a save is on its way", async () => {
    let answer = () => {}
    server({ slowSave: new Promise<void>((resolve) => (answer = resolve)) })
    const page = await open()
    await userEvent.type(await within(page).findByLabelText('How do you know Lars?'), 'Work')

    await userEvent.click(within(page).getByRole('button', { name: 'Save & next' }))
    expect(within(page).getByRole('button', { name: 'Skip' })).toBeDisabled()
    answer()

    expect(await within(page).findByText('2 of 3')).toBeInTheDocument()
  })

  it('puts the focus on each new card', async () => {
    server()
    const page = await open()
    await userEvent.type(await within(page).findByLabelText('How do you know Lars?'), 'Work')
    await userEvent.click(within(page).getByRole('button', { name: 'Save & next' }))

    await waitFor(() => expect(screen.getByRole('group', { name: 'Fill in Greta' })).toHaveFocus())
  })

  it('starts from the spaces they have now', async () => {
    server({ spacesOf: { lars: [{ id: 's2', name: 'Work', color: 'teal' }] } })
    await open()

    await waitFor(async () =>
      expect(within(await card()).getByRole('checkbox', { name: /Work/ })).toBeChecked(),
    )
  })

  it("says so when the list can't be read", async () => {
    server()
    await open('/people/fill-in?import=bad')

    expect(await screen.findByRole('alert')).toHaveTextContent('Not a valid id.')
  })
})
