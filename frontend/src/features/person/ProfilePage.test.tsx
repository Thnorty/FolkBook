import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'
import { intervalLabel, relationLabel } from './labels'

const ME = { id: 'u1', email: 'ela@example.com', is_admin: false, me: { id: 'me', name: 'Ela' } }
const ref = (id: string, name: string) => ({ id, name })

const EMMA = {
  id: 'emma',
  name: 'Emma Yılmaz',
  how_we_met: 'Met at university in Istanbul, 2015',
  work: 'Designer at Loop',
  birthday: { day: 12, month: 3, year: null },
  tags: ['Galatasaray'],
  spaces: [{ id: 's1', name: 'Friends', color: 'sage' }],
  is_me: false,
  is_mine: true,
  owner: ref('me', 'Ela'),
  needs_details: false,
  last_talked_on: null,
  contact_methods: [{ id: 'c1', kind: 'phone', label: 'mobile', value: '+90 555 000' }],
  can_edit: true,
  can_delete: true,
}

const family = (person: string, name: string, relation: string, extra = {}) => ({
  person: ref(person, name),
  relation,
  derived: false,
  former: false,
  parent_type: null,
  direct_link_id: null,
  ...extra,
})

const link = (id: string, other: string, name: string, type: string, extra = {}) => ({
  id,
  person_a: ref('emma', 'Emma Yılmaz'),
  person_b: ref(other, name),
  type,
  parent_type: null,
  label: '',
  started_on: null,
  ended_on: null,
  is_former: false,
  space: null,
  is_mine: true,
  ...extra,
})

type Overrides = Record<string, (request: Request) => Response | Promise<Response>>

function server(overrides: Overrides = {}) {
  let aids = [{ id: 'a1', person_id: 'emma', text: 'Kid: Arda, 6', pinned: false, position: 0 }]
  let note: { body: string; updated_at: string | null } = {
    body: 'Wants to move back to Izmir.',
    updated_at: '2026-09-01T10:00:00Z',
  }
  const writes: { method: string; path: string; body: unknown }[] = []
  const record = async (request: Request) =>
    writes.push({
      method: request.method,
      path: new URL(request.url).pathname,
      body: request.method === 'DELETE' ? null : await request.json(),
    })

  fakeServer({
    'GET /api/auth/me': () => json(ME),
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/spaces': () => json({ items: [], count: 0 }),
    'GET /api/people': () => json({ items: [], count: 0 }),
    'GET /api/people/emma': () => json(EMMA),
    'GET /api/people/emma/family': () =>
      json([
        family('kerem', 'Kerem Yılmaz', 'partner'),
        family('tom', 'Tom Bergqvist', 'cousin', { derived: true }),
        family('nazli', 'Nazlı Yılmaz', 'parent_in_law', { derived: true, former: true }),
      ]),
    'GET /api/relationships': () =>
      json({
        items: [
          link('l1', 'deniz', 'Deniz Arslan', 'friend'),
          link('l2', 'defne', 'Defne Aydın', 'met_at', { label: 'Hackathon 2026' }),
          link('l3', 'berk', 'Berk', 'friend', { is_former: true }),
          link('l4', 'can', 'Can', 'colleague', { is_former: true }),
        ],
        count: 4,
      }),
    'GET /api/memory-aids': () => json({ items: aids, count: aids.length }),
    'POST /api/memory-aids': async (request) => {
      await record(request)
      const { text } = writes.at(-1)!.body as { text: string }
      aids = [...aids, { id: 'a2', person_id: 'emma', text, pinned: false, position: 1 }]
      return json(aids.at(-1), 201)
    },
    'DELETE /api/memory-aids/a1': async (request) => {
      await record(request)
      aids = aids.filter((aid) => aid.id !== 'a1')
      return new Response(null, { status: 204 })
    },
    'GET /api/people/emma/note': () => json(note),
    'PUT /api/people/emma/note': async (request) => {
      await record(request)
      note = { body: (writes.at(-1)!.body as { body: string }).body, updated_at: null }
      return json(note)
    },
    'GET /api/interactions': () =>
      json({
        items: [
          {
            id: 'i1',
            person_id: 'emma',
            kind: 'met',
            label: 'Coffee at Kronotrop',
            occurred_on: '2026-09-12',
            note: 'Dinosaur drawings.',
          },
        ],
        count: 1,
      }),
    'GET /api/keep-in-touch/emma': () =>
      json({ interval_days: 60, snoozed_until: null, stopped: false }),
    ...overrides,
  })
  return writes
}

const section = (name: string) => screen.findByRole('region', { name })

afterEach(clearCookies)

describe('profile page', () => {
  it('shows who they are', async () => {
    server()
    renderApp('/people/emma')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Emma Yılmaz' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Met at university in Istanbul, 2015')).toBeInTheDocument()
    expect(screen.getByText('Designer at Loop')).toBeInTheDocument()
    expect(screen.getByText(/Birthday .*12/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+90 555 000' })).toHaveAttribute(
      'href',
      'tel:+90 555 000',
    )
    expect(screen.getByText('Galatasaray')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('Emma Yılmaz · FolkBook'))
  })

  it('adds and removes sticky notes', async () => {
    const writes = server()
    renderApp('/people/emma')
    const remember = await section('Remember')
    expect(await within(remember).findByText('Kid: Arda, 6')).toBeInTheDocument()

    await userEvent.click(within(remember).getByRole('button', { name: 'Add' }))
    await userEvent.type(
      within(remember).getByRole('textbox', { name: 'New sticky note' }),
      'Allergic to peanuts{Enter}',
    )
    expect(await within(remember).findByText('Allergic to peanuts')).toBeInTheDocument()

    await userEvent.click(within(remember).getByRole('button', { name: 'Remove “Kid: Arda, 6”' }))
    await waitFor(() =>
      expect(within(remember).queryByText('Kid: Arda, 6')).not.toBeInTheDocument(),
    )

    expect(writes).toEqual([
      {
        method: 'POST',
        path: '/api/memory-aids',
        body: { person_id: 'emma', text: 'Allergic to peanuts', pinned: false },
      },
      { method: 'DELETE', path: '/api/memory-aids/a1', body: null },
    ])
  })

  it('edits the notes', async () => {
    const writes = server()
    renderApp('/people/emma')
    const notes = await section('Notes')
    expect(await within(notes).findByText('Wants to move back to Izmir.')).toBeInTheDocument()

    await userEvent.click(within(notes).getByRole('button', { name: 'Edit' }))
    const box = within(notes).getByRole('textbox', { name: 'Notes about Emma' })
    await userEvent.clear(box)
    await userEvent.type(box, 'Moved to Izmir in October.')
    await userEvent.click(within(notes).getByRole('button', { name: 'Save' }))

    expect(await within(notes).findByText('Moved to Izmir in October.')).toBeInTheDocument()
    expect(writes).toEqual([
      {
        method: 'PUT',
        path: '/api/people/emma/note',
        body: { body: 'Moved to Izmir in October.' },
      },
    ])
  })

  it('groups connections, marks derived ones and folds a long Former group', async () => {
    server()
    renderApp('/people/emma')
    const connections = await section('Connections')

    expect(await within(connections).findByText('4 current · 3 former')).toBeInTheDocument()
    expect(
      within(connections).getByRole('link', { name: /Tom Bergqvist\s*cousin\s*derived/ }),
    ).toHaveAttribute('href', '/people/tom')
    expect(
      within(connections).getByRole('link', { name: /Defne Aydın\s*met at Hackathon 2026/ }),
    ).toBeInTheDocument()
    expect(within(connections).queryByText('Nazlı Yılmaz')).not.toBeInTheDocument()

    await userEvent.click(within(connections).getByRole('button', { name: 'Show' }))

    expect(
      within(connections).getByRole('link', {
        name: /Nazlı Yılmaz\s*former parent-in-law\s*derived/,
      }),
    ).toBeInTheDocument()
  })

  it('shows the timeline and how often to keep in touch', async () => {
    server()
    renderApp('/people/emma')

    const timeline = await section('Timeline')
    expect(await within(timeline).findByText('Coffee at Kronotrop')).toBeInTheDocument()
    expect(within(timeline).getByText('Dinosaur drawings.')).toBeInTheDocument()
    expect(
      await within(await section('Keep in touch')).findByText('Every 2 months'),
    ).toBeInTheDocument()
  })

  it('invites you to start when there is nothing yet', async () => {
    server({
      'GET /api/memory-aids': () => json({ items: [], count: 0 }),
      'GET /api/people/emma/note': () => json({ body: '', updated_at: null }),
      'GET /api/interactions': () => json({ items: [], count: 0 }),
      'GET /api/people/emma/family': () => json([]),
      'GET /api/relationships': () => json({ items: [], count: 0 }),
    })
    renderApp('/people/emma')

    expect(
      await within(await section('Remember')).findByText(/small stuff you'd be embarrassed/),
    ).toBeInTheDocument()
    expect(
      await within(await section('Notes')).findByRole('button', { name: 'Write a note' }),
    ).toBeInTheDocument()
    expect(
      await within(await section('Timeline')).findByText('first coffee goes here'),
    ).toBeInTheDocument()
    expect(
      await within(await section('Connections')).findByText('No connections yet.'),
    ).toBeInTheDocument()
  })

  it("says so when the person isn't in your notebook", async () => {
    server({ 'GET /api/people/emma': () => json({ detail: 'Not Found' }, 404) })
    renderApp('/people/emma')

    expect(await screen.findByRole('heading', { name: 'Not in your notebook' })).toBeInTheDocument()
  })
})

describe('peek panel', () => {
  it('opens beside the People list on desktop, and expands to the page', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('min-width'),
      media: query,
    }))
    server({ 'GET /api/people': () => json({ items: [{ ...EMMA, spaces: [] }], count: 1 }) })
    const router = renderApp('/people')

    await userEvent.click(await screen.findByRole('link', { name: /Emma Yılmaz/ }))

    const panel = await screen.findByRole('complementary', { name: 'Peek' })
    expect(await within(panel).findByRole('heading', { name: 'Emma Yılmaz' })).toBeInTheDocument()
    expect(router.state.location.search).toEqual({ peek: 'emma' })
    expect(within(panel).getByRole('link', { name: 'Expand to page' })).toHaveAttribute(
      'href',
      '/people/emma',
    )

    await userEvent.click(within(panel).getByRole('button', { name: 'Close peek' }))
    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: 'Peek' })).not.toBeInTheDocument(),
    )
  })
})

describe('peek panel and the list', () => {
  it("keeps the card's photo and name in the list while the panel shows them", async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('min-width'),
      media: query,
    }))
    server({ 'GET /api/people': () => json({ items: [{ ...EMMA, spaces: [] }], count: 1 }) })
    renderApp('/people')
    const list = await screen.findByRole('region', { name: 'People' })
    await userEvent.click(await within(list).findByRole('link', { name: /Emma Yılmaz/ }))
    const panel = await screen.findByRole('complementary', { name: 'Peek' })
    await within(panel).findByRole('heading', { name: 'Emma Yılmaz' })

    // Two elements with the same shared id compete for the page turn and one gets hidden.
    const ids = [...document.querySelectorAll('[data-shared]')].map((el) =>
      el.getAttribute('data-shared'),
    )
    expect(ids).toEqual(['person-emma-photo', 'person-emma-name']) // only the card's
  })
})

describe('labels', () => {
  it('names relations and intervals in words', () => {
    expect(relationLabel('half_sibling')).toBe('half-sibling')
    expect(relationLabel('aunt_uncle')).toBe('aunt or uncle')
    expect(relationLabel('something_new')).toBe('something new')
    expect(intervalLabel(7)).toBe('Every week')
    expect(intervalLabel(60)).toBe('Every 2 months')
    expect(intervalLabel(365)).toBe('Every year')
    expect(intervalLabel(10)).toBe('Every 10 days')
  })
})
