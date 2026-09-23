import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'
import { loggedSummary } from './labels'

const ME = { id: 'u1', email: 'ela@example.com', is_admin: false, me: { id: 'me', name: 'Ela' } }

const person = (id: string, name: string, extra = {}) => ({
  id,
  name,
  how_we_met: '',
  work: '',
  birthday: null,
  tags: [],
  spaces: [],
  photo: null,
  is_me: false,
  is_mine: true,
  owner: { id: 'me', name: 'Ela' },
  needs_details: false,
  last_talked_on: null,
  contact_methods: [],
  can_edit: true,
  can_delete: true,
  ...extra,
})

const COFFEE = {
  id: 'i1',
  person_id: 'emma',
  kind: 'met',
  label: 'Coffee at Kronotrop',
  occurred_on: '2026-09-12',
  note: 'Dinosaur drawings.',
}

type Write = { method: string; path: string; body: unknown }

function server() {
  const writes: Write[] = []
  const record = async (request: Request) => {
    const body = request.method === 'DELETE' ? null : await request.json()
    writes.push({ method: request.method, path: new URL(request.url).pathname, body })
    return body as Record<string, unknown>
  }
  const empty = () => json({ items: [], count: 0 })
  const deleted = async (request: Request) => {
    await record(request)
    return new Response(null, { status: 204 })
  }

  fakeServer({
    'GET /api/auth/me': () => json(ME),
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/spaces': empty,
    'GET /api/people': empty,
    'GET /api/people/emma': () => json(person('emma', 'Emma Yılmaz')),
    'GET /api/people/me': () => json(person('me', 'Ela', { is_me: true })),
    'GET /api/people/emma/family': () => json([]),
    'GET /api/people/me/family': () => json([]),
    'GET /api/relationships': empty,
    'GET /api/memory-aids': empty,
    'GET /api/people/emma/note': () => json({ body: '', updated_at: null }),
    'GET /api/people/me/note': () => json({ body: '', updated_at: null }),
    'GET /api/interactions': () => json({ items: [COFFEE], count: 1 }),
    'GET /api/keep-in-touch/emma': () =>
      json({ interval_days: null, snoozed_until: null, stopped: false }),
    'POST /api/interactions': async (request) =>
      json({ id: 'i2', person_id: 'emma', label: '', note: '', ...(await record(request)) }, 201),
    'PATCH /api/interactions/i1': async (request) =>
      json({ ...COFFEE, ...(await record(request)) }),
    'DELETE /api/interactions/i1': deleted,
    'DELETE /api/interactions/i2': deleted,
    'POST /api/memory-aids': async (request) =>
      json({ id: 'a1', pinned: false, position: 0, ...(await record(request)) }, 201),
    'DELETE /api/memory-aids/a1': deleted,
  })
  return writes
}

const saveShortcut = (dialog: HTMLElement) =>
  fireEvent.keyDown(dialog, { key: 'Enter', ctrlKey: true })

beforeEach(() => {
  // Only the clock is fake, so "today" is known and user events still run.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
})

afterEach(() => {
  vi.useRealTimers()
  clearCookies()
})

describe('logging an interaction', () => {
  it('opens on L, saves with a sticky note from the note, and can be undone', async () => {
    const writes = server()
    renderApp('/people/emma')
    await screen.findByRole('heading', { level: 1, name: 'Emma Yılmaz' })

    await userEvent.keyboard('l')
    const dialog = await screen.findByRole('dialog', { name: 'Log with Emma' })
    expect(within(dialog).getByRole('radio', { name: /Met/ })).toBeChecked()
    expect(within(dialog).getByRole('radio', { name: 'Today' })).toBeChecked()

    await userEvent.click(within(dialog).getByRole('radio', { name: 'Call' }))
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Yesterday' }))
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: /Note/ }),
      "Long call. Arda's into dinosaurs.",
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Turn a line into a memory aid' }),
    )
    const toAdd = within(dialog).getByRole('list', { name: 'Sticky notes to add' })
    expect(within(toAdd).getByText("Arda's into dinosaurs")).toBeInTheDocument()
    saveShortcut(dialog)

    expect(await screen.findByText('Logged: called Emma yesterday')).toBeInTheDocument()
    expect(screen.getByText('And a sticky note on Remember')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(writes).toEqual([
      {
        method: 'POST',
        path: '/api/interactions',
        body: {
          person_id: 'emma',
          kind: 'call',
          label: '',
          occurred_on: '2026-09-22',
          note: "Long call. Arda's into dinosaurs.",
        },
      },
      {
        method: 'POST',
        path: '/api/memory-aids',
        body: { person_id: 'emma', text: "Arda's into dinosaurs", pinned: false },
      },
    ])

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(writes).toHaveLength(4))
    expect(writes.slice(2)).toEqual([
      { method: 'DELETE', path: '/api/interactions/i2', body: null },
      { method: 'DELETE', path: '/api/memory-aids/a1', body: null },
    ])
  })

  it('asks what it was for Other, and logs any earlier day', async () => {
    const writes = server()
    renderApp('/people/emma')
    const timeline = await screen.findByRole('region', { name: 'Timeline' })

    await userEvent.click(within(timeline).getByRole('button', { name: /Log/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Log with Emma' })
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Other…' }))
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'What was it?' }), 'Dinner')
    fireEvent.change(within(dialog).getByLabelText('Another day'), {
      target: { value: '2026-09-01' },
    })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save to timeline' }))

    await waitFor(() =>
      expect(writes[0]?.body).toEqual({
        person_id: 'emma',
        kind: 'custom',
        label: 'Dinner',
        occurred_on: '2026-09-01',
        note: '',
      }),
    )
  })

  it('changes an entry, and deletes one with a way back', async () => {
    const writes = server()
    renderApp('/people/emma')
    const timeline = await screen.findByRole('region', { name: 'Timeline' })

    await userEvent.click(await within(timeline).findByRole('button', { name: /Coffee/ }))
    let dialog = await screen.findByRole('dialog', { name: 'Edit entry' })
    const note = within(dialog).getByRole('textbox', { name: /Note/ })
    expect(note).toHaveValue('Dinosaur drawings.')
    await userEvent.clear(note)
    await userEvent.type(note, 'Dinosaur drawings, and a T. rex.')
    saveShortcut(dialog)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await userEvent.click(within(timeline).getByRole('button', { name: /Coffee/ }))
    dialog = await screen.findByRole('dialog', { name: 'Edit entry' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete this entry' }))
    expect(await screen.findByText("Removed from Emma's timeline")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))

    await waitFor(() => expect(writes).toHaveLength(3))
    expect(writes).toEqual([
      {
        method: 'PATCH',
        path: '/api/interactions/i1',
        body: {
          kind: 'met',
          label: 'Coffee at Kronotrop',
          occurred_on: '2026-09-12',
          note: 'Dinosaur drawings, and a T. rex.',
        },
      },
      { method: 'DELETE', path: '/api/interactions/i1', body: null },
      {
        method: 'POST',
        path: '/api/interactions',
        body: {
          person_id: 'emma',
          kind: 'met',
          label: 'Coffee at Kronotrop',
          occurred_on: '2026-09-12',
          note: 'Dinosaur drawings.',
        },
      },
    ])
  })

  it("isn't offered on your own page", async () => {
    server()
    renderApp('/people/me')
    const timeline = await screen.findByRole('region', { name: 'Timeline' })

    expect(within(timeline).queryByRole('button', { name: /Log/ })).not.toBeInTheDocument()
    await userEvent.keyboard('l')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('loggedSummary', () => {
  const today = new Date(2026, 8, 23)

  it('says what happened in a few words', () => {
    const entry = (kind: 'met' | 'call' | 'event' | 'custom', label = '') => ({
      kind,
      label,
      occurred_on: '2026-09-23',
    })

    expect(loggedSummary(entry('met'), 'Emma', today)).toBe('met Emma today')
    expect(loggedSummary(entry('call'), 'Emma', today)).toBe('called Emma today')
    expect(loggedSummary(entry('event'), 'Emma', today)).toBe('Event with Emma today')
    expect(loggedSummary(entry('custom', 'Dinner'), 'Emma', today)).toBe('Dinner with Emma today')
  })
})
