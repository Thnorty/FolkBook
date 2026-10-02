import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

const ME = { id: 'u1', email: 'ela@example.com', is_admin: false, me: { id: 'me', name: 'Ela' } }
const ref = (id: string, name: string) => ({ id, name })

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
  owner: ref('me', 'Ela'),
  needs_details: false,
  last_talked_on: null,
  added_at: '2026-09-21T09:00:00Z',
  ...extra,
})

const HACKATHON = {
  id: 's9',
  name: 'Hackathon 2026',
  color: 'plum',
  description: '',
  share_contact_details: false,
  role: 'viewer',
  owner: ref('defne', 'Defne Aydın'),
  people_count: 11,
  member_count: 4,
}

type Write = { method: string; path: string; body: unknown }
type Overrides = Record<string, (request: Request) => Response | Promise<Response>>

function server(overrides: Overrides = {}) {
  const writes: Write[] = []
  const requests: string[] = []
  const record = async (request: Request) => {
    const body = request.method === 'DELETE' ? null : await request.json()
    writes.push({ method: request.method, path: new URL(request.url).pathname, body })
    return body as Record<string, unknown>
  }
  const page =
    (items: unknown[], count = items.length) =>
    () =>
      json({ items, count })

  fakeServer({
    'GET /api/auth/me': () => json(ME),
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/spaces': page([HACKATHON]),
    'GET /api/people': (request) => {
      const query = new URL(request.url).searchParams
      if (query.get('needs_details')) {
        return json({ items: [person('anna', 'Anna K.'), person('jonas', 'Jonas W.')], count: 12 })
      }
      if (query.get('recent')) return json({ items: [person('tom', 'Tom Bergqvist')], count: 1 })
      return json({ items: [], count: 30 })
    },
    'GET /api/today/birthdays': (request) => {
      requests.push(new URL(request.url).search)
      return json([
        { person: person('selin', 'Selin Yılmaz'), on: '2026-09-22', turns: 34 },
        { person: person('tom', 'Tom Bergqvist'), on: '2026-09-24', turns: null },
      ])
    },
    'GET /api/keep-in-touch/due': (request) => {
      requests.push(new URL(request.url).search)
      return json([
        {
          person: ref('deniz', 'Deniz Arslan'),
          interval_days: 60,
          days_since: 120,
          last_talked_on: '2026-05-22',
          hint: "Said you'd help with the move",
        },
      ])
    },
    'GET /api/today/remember': (request) => {
      const skip = new URL(request.url).searchParams.get('skip')
      return json(
        skip
          ? {
              aid: { id: 'a2', person_id: 'emma', text: 'Loves figs', pinned: false, position: 1 },
              person: ref('emma', 'Emma Yılmaz'),
            }
          : {
              aid: {
                id: 'a1',
                person_id: 'emma',
                text: "Emma's kid is Arda",
                pinned: false,
                position: 0,
              },
              person: ref('emma', 'Emma Yılmaz'),
            },
      )
    },
    'GET /api/keep-in-touch/deniz': () =>
      json({
        interval_days: 60,
        snoozed_until: null,
        stopped: false,
        default_interval_days: null,
        next_nudge_on: '2026-07-21',
      }),
    'PUT /api/keep-in-touch/deniz': async (request) => json({ ...(await record(request)) }),
    'POST /api/interactions': async (request) =>
      json({ id: 'i9', note: '', ...(await record(request)) }, 201),
    'DELETE /api/interactions/i9': async (request) => {
      await record(request)
      return new Response(null, { status: 204 })
    },
    ...overrides,
  })
  return { writes, requests }
}

const section = (name: string) => screen.findByRole('region', { name })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 22, 9, 0)) // Tuesday 22 September 2026, local time
})

afterEach(() => {
  vi.useRealTimers()
  clearCookies()
  localStorage.clear()
})

describe('Today', () => {
  it("shows what's worth attention, asking with the device's date", async () => {
    const { requests } = server()
    renderApp('/')

    const birthdays = await section('Birthdays')
    expect(await within(birthdays).findByText('Turns 34 today')).toBeInTheDocument()
    expect(within(birthdays).getByText(/Birthday on Thursday/)).toBeInTheDocument()
    const keep = await section('Keep in touch')
    expect(await within(keep).findByText("Said you'd help with the move")).toBeInTheDocument()
    expect(within(keep).getByText(/every 2 months/)).toBeInTheDocument()
    expect(
      await within(await section('Remember?')).findByText("Emma's kid is Arda"),
    ).toBeInTheDocument()
    expect(
      await within(await section('Fill in the blanks')).findByText('12 without details'),
    ).toBeInTheDocument()
    expect(within(await section('Shared with you')).getByText('Hackathon 2026')).toBeInTheDocument()
    expect(within(await section('Recently added')).getByText('Tom Bergqvist')).toBeInTheDocument()
    expect(screen.getByText(/2 birthdays · 1 nudge/)).toBeInTheDocument()
    expect(requests).toContain('?today=2026-09-22')
  })

  it('sends birthday wishes in one tap, with Undo', async () => {
    const { writes } = server()
    renderApp('/')

    await userEvent.click(
      await within(await section('Birthdays')).findByRole('button', { name: 'Wish' }),
    )
    expect(await screen.findByText('Logged: birthday wishes to Selin')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))

    await waitFor(() => expect(writes).toHaveLength(2))
    expect(writes).toEqual([
      {
        method: 'POST',
        path: '/api/interactions',
        body: {
          person_id: 'selin',
          kind: 'message',
          label: 'Birthday wishes',
          occurred_on: '2026-09-22',
          occurred_at: expect.stringMatching(/^\d\d:\d\d$/), // now
        },
      },
      { method: 'DELETE', path: '/api/interactions/i9', body: null },
    ])
  })

  it('logs "We talked", snoozes for a week and stops, keeping the interval', async () => {
    const { writes } = server()
    renderApp('/')
    const keep = await section('Keep in touch')

    await userEvent.click(await within(keep).findByRole('button', { name: 'We talked' }))
    expect(await screen.findByText('Logged: talked with Deniz today')).toBeInTheDocument()
    await userEvent.click(within(keep).getByRole('button', { name: 'Snooze' }))
    expect(await screen.findByText('Deniz snoozed for a week')).toBeInTheDocument()
    await userEvent.click(within(keep).getByRole('button', { name: 'Stop' }))

    await waitFor(() => expect(writes).toHaveLength(3))
    expect(writes).toEqual([
      {
        method: 'POST',
        path: '/api/interactions',
        body: {
          person_id: 'deniz',
          kind: 'custom',
          label: 'Talked',
          occurred_on: '2026-09-22',
          occurred_at: expect.stringMatching(/^\d\d:\d\d$/),
        },
      },
      {
        method: 'PUT',
        path: '/api/keep-in-touch/deniz',
        body: { interval_days: 60, snoozed_until: '2026-09-29', stopped: false },
      },
      {
        method: 'PUT',
        path: '/api/keep-in-touch/deniz',
        body: { interval_days: 60, snoozed_until: '2026-09-29', stopped: true }, // keeps the snooze
      },
    ])
  })

  it('shows another memory aid', async () => {
    server()
    renderApp('/')
    const remember = await section('Remember?')
    await within(remember).findByText("Emma's kid is Arda")

    await userEvent.click(within(remember).getByRole('button', { name: 'Show another' }))
    expect(await within(remember).findByText('Loves figs')).toBeInTheDocument()
    expect(within(remember).queryByRole('button', { name: 'Got it' })).not.toBeInTheDocument()
  })

  it('remembers on this device that a shared space was dismissed', async () => {
    server()
    renderApp('/')

    await userEvent.click(
      await within(await section('Shared with you')).findByRole('button', { name: 'Dismiss' }),
    )

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Shared with you' })).not.toBeInTheDocument(),
    )
    expect(JSON.parse(localStorage.getItem('folkbook.today.dismissedSpaces') ?? '[]')).toEqual([
      's9',
    ])
  })

  it('invites you to start when there is nothing to show', async () => {
    const empty = () => json({ items: [], count: 0 })
    server({
      'GET /api/spaces': empty,
      'GET /api/people': empty,
      'GET /api/today/birthdays': () => json([]),
      'GET /api/keep-in-touch/due': () => json([]),
      'GET /api/today/remember': () => new Response(null, { status: 204 }),
    })
    renderApp('/')

    expect(
      await screen.findByRole('heading', { name: 'Today fills up as your book does' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add someone' })).toBeInTheDocument()
  })
})
