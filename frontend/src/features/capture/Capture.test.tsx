import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isoDay } from '@/lib/dates'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

const ME = { id: 'u1', email: 'ela@example.com', is_admin: false, me: { id: 'me', name: 'Ela' } }
const TEXT = "Met Tom at the hackathon, he's Emma's cousin, likes climbing"

const provider = (extra = {}) => ({
  provider: 'gemini',
  base_url: '',
  model: 'gemini-2.5-flash',
  key_hint: '3f9a',
  key_unreadable: false,
  set_by: null,
  updated_at: '2026-10-11T09:00:00Z',
  ...extra,
})

const space = (id: string, name: string, role: string) => ({
  id,
  name,
  color: 'teal',
  description: '',
  share_contact_details: false,
  role,
  owner: { id: 'me', name: 'Ela' },
  people_count: 3,
  member_count: 0,
})

const emma = {
  id: 'emma',
  name: 'Emma Yılmaz',
  detail: 'University, Istanbul',
  owner: { id: 'me', name: 'Ela' },
  current: { how_we_met: 'University, Istanbul', work: 'Google', birthday: null, tags: [] },
  can_edit: true,
  can_tag: true,
  in_space: false,
}

const DRAFT = {
  people: [
    {
      ref: 't',
      name: 'Tom',
      how_we_met: 'At the hackathon',
      work: null,
      birthday: null,
      tags: [],
      match: 'new',
      candidates: [],
    },
    {
      ref: 'e',
      name: 'Emma',
      how_we_met: null,
      work: 'Spotify',
      birthday: null,
      tags: [],
      match: 'choose',
      candidates: [emma],
    },
  ],
  connections: [{ id: 'c1', a: 't', b: 'e', type: 'cousin', label: '', parent_type: null }],
  memory_aids: [{ id: 'm1', about: 't', text: 'Likes climbing' }],
  entries: [],
}

const SAVED = {
  capture_id: 'cap1',
  added: { people: 1, connections: 1, memory_aids: 1, entries: 0, changes: 1 },
  matched: ['Emma Yılmaz'],
  people: [
    { id: 'tom', name: 'Tom', new: true },
    { id: 'emma', name: 'Emma Yılmaz', new: false },
  ],
}

type Options = {
  using?: 'mine' | 'server' | null
  admin?: boolean
  suggest?: (request: Request) => Response | Promise<Response>
}

function server({ using = 'mine', admin = false, suggest }: Options = {}) {
  const bodies: Record<string, unknown[]> = { suggest: [], save: [], undo: [] }
  const record = (name: string) => async (request: Request) => {
    bodies[name].push(request.method === 'POST' ? await request.json().catch(() => null) : null)
  }
  fakeServer({
    'GET /api/auth/me': () => json({ ...ME, is_admin: admin }),
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/today/access-ended': () => json([]),
    'GET /api/ai': () =>
      json({
        mine: using === 'mine' ? provider() : null,
        server:
          using === 'server'
            ? provider({ provider: 'openai_compatible', model: 'llama3.1:8b', set_by: 'Ela Kaya' })
            : null,
        using,
        can_manage_server: admin,
      }),
    'GET /api/spaces': () =>
      json({
        items: [space('s1', 'Climbing club', 'owner'), space('s2', 'Hackathon', 'viewer')],
        count: 2,
      }),
    'POST /api/capture/suggest': async (request) => {
      await record('suggest')(request.clone())
      return suggest ? suggest(request) : json(DRAFT)
    },
    'POST /api/capture/save': async (request) => {
      await record('save')(request)
      return json(SAVED, 201)
    },
    'POST /api/capture/cap1/undo': async (request) => {
      bodies.undo.push(null)
      void request
      return json({
        removed: { people: 1, connections: 1, memory_aids: 1, entries: 0 },
        restored: 1,
      })
    },
  })
  return bodies
}

async function write(text = TEXT) {
  const box = await screen.findByRole('textbox', { name: 'What happened?' })
  await userEvent.type(box, text)
  return box
}

async function toReview() {
  server()
  renderApp('/capture')
  await write()
  await userEvent.click(screen.getByRole('button', { name: 'Suggest' }))
  await screen.findByRole('heading', { name: "Here's what I read" })
}

afterEach(() => {
  clearCookies()
  vi.useRealTimers()
})

describe('Quick capture', () => {
  it('says AI is off and offers the form', async () => {
    server({ using: null, admin: true })
    renderApp('/capture')

    expect(
      await screen.findByText('Quick capture needs an AI key of your own.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add a key in Settings →' })).toHaveAttribute(
      'href',
      '/settings/ai',
    )
    expect(
      screen.getByText('As an admin you can add one for everyone on this server.'),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Fill in the form myself' }))
    expect(await screen.findByRole('dialog', { name: 'Add someone' })).toBeVisible()
  })

  it('says whose AI it uses', async () => {
    server({ using: 'server' })
    renderApp('/capture')

    expect(
      await screen.findByText("OpenAI-compatible · llama3.1:8b · the server's, set up by Ela"),
    ).toBeInTheDocument()
  })

  it('suggests, reviews and saves', async () => {
    const bodies = server()
    renderApp('/capture')
    expect(await screen.findByText('Gemini · gemini-2.5-flash · your key')).toBeInTheDocument()
    await write()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Put everyone in a space' }))
    // Only spaces you can add people to.
    const spaces = screen.getByRole('combobox', { name: 'Space' })
    expect(
      within(spaces)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Climbing club'])
    await userEvent.click(screen.getByRole('button', { name: 'Suggest' }))

    await screen.findByRole('heading', { name: "Here's what I read" })
    expect(bodies.suggest).toEqual([{ text: TEXT, today: isoDay(), space_id: 's1' }])
    expect(screen.getByRole('checkbox', { name: 'New person · Tom' })).toBeChecked()
    expect(screen.getByText('Memory aids stay private, even in shared spaces.')).toBeVisible()
    expect(
      screen.getByText(/Saved as other family · cousin — nobody's parents needed/),
    ).toBeVisible()
    const who = screen.getByRole('radiogroup', { name: 'Who is “Emma”?' })
    await userEvent.click(within(who).getByRole('radio', { name: /Emma Yılmaz/ }))
    expect(
      await screen.findByRole('checkbox', { name: 'Emma Yılmaz · Work: Google → Spotify' }),
    ).toBeChecked()
    expect(screen.getByText('5 of 5 selected')).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: 'Save 5 items' }))

    expect(await screen.findByText('Added 1 person, 1 connection and 1 memory aid.')).toBeVisible()
    expect(screen.getByText('Emma matched to someone you already had.')).toBeVisible()
    expect(screen.getByText('Updated 1 detail.')).toBeVisible()
    expect(screen.getByRole('link', { name: "Open Tom's page" })).toHaveAttribute(
      'href',
      '/people/tom',
    )
    expect(bodies.save).toEqual([
      {
        space_id: 's1',
        new_people: [
          {
            ref: 't',
            name: 'Tom',
            how_we_met: 'At the hackathon',
            work: '',
            birthday: null,
            tags: [],
          },
        ],
        existing_people: [{ ref: 'e', person_id: 'emma', changes: { work: 'Spotify' } }],
        connections: [{ a: 't', b: 'e', type: 'cousin', label: '', parent_type: null }],
        memory_aids: [{ about: 't', text: 'Likes climbing' }],
        entries: [],
      },
    ])
  })

  it('waits for every “Who is” before saving', async () => {
    const bodies = server()
    renderApp('/capture')
    await write()
    await userEvent.click(screen.getByRole('button', { name: 'Suggest' }))
    await screen.findByRole('heading', { name: "Here's what I read" })

    await userEvent.click(screen.getByRole('button', { name: 'Save 4 items' }))

    expect(await screen.findByText('Choose who this is first.')).toBeVisible()
    expect(bodies.save).toEqual([])
  })

  it('unticks what belongs to someone unticked', async () => {
    await toReview()

    await userEvent.click(screen.getByRole('checkbox', { name: 'New person · Tom' }))

    expect(screen.getByRole('checkbox', { name: 'Connection · Tom — Emma' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Memory aid · on Tom' })).not.toBeChecked()
    expect(screen.getByText('1 of 4 selected')).toBeVisible()
  })

  it('can be cancelled while reading, and says why it failed', async () => {
    let fail = false
    server({
      suggest: (request) =>
        fail
          ? json({ detail: 'Your key was refused. Check Settings → AI.' }, 424)
          : new Promise((_, reject) =>
              request.signal.addEventListener('abort', () =>
                reject(new DOMException('Aborted', 'AbortError')),
              ),
            ),
    })
    renderApp('/capture')
    await write()
    await userEvent.click(screen.getByRole('button', { name: 'Suggest' }))
    expect(await screen.findByText('Reading it back…')).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await screen.findByRole('textbox', { name: 'What happened?' })).toHaveValue(TEXT)

    fail = true
    await userEvent.click(screen.getByRole('button', { name: 'Suggest' }))
    expect(await screen.findByText('Your key was refused. Check Settings → AI.')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Edit text' }))
    expect(await screen.findByRole('textbox', { name: 'What happened?' })).toHaveValue(TEXT)
  })

  it('says local models are slow', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    server({ suggest: () => new Promise(() => {}) })
    renderApp('/capture')
    await write()
    await userEvent.click(screen.getByRole('button', { name: 'Suggest' }))
    await screen.findByText('Reading it back…')
    expect(screen.queryByText('Local models can take a minute.')).not.toBeInTheDocument()

    act(() => vi.advanceTimersByTime(10_000))

    expect(await screen.findByText('Local models can take a minute.')).toBeVisible()
  })

  it('undoes all of it', async () => {
    await toReview()
    const who = screen.getByRole('radiogroup', { name: 'Who is “Emma”?' })
    await userEvent.click(within(who).getByRole('radio', { name: /Emma Yılmaz/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save 5 items' }))

    await userEvent.click(await screen.findByRole('button', { name: 'Undo all of this' }))

    expect(
      await screen.findByText('Undone: 1 person, 1 connection, 1 memory aid and 1 detail'),
    ).toBeVisible()
    expect(await screen.findByRole('textbox', { name: 'What happened?' })).toHaveValue(TEXT)
  })

  it('adds something the AI missed', async () => {
    const bodies = server()
    renderApp('/capture')
    await write()
    await userEvent.click(screen.getByRole('button', { name: 'Suggest' }))
    await screen.findByRole('heading', { name: "Here's what I read" })
    await userEvent.click(screen.getByRole('radio', { name: /Someone else/ }))

    await userEvent.click(screen.getByRole('button', { name: '+ Add something the AI missed' }))
    await userEvent.click(screen.getByRole('button', { name: 'Memory aid' }))
    const added = screen.getAllByRole('textbox', { name: 'Memory aid' }).at(-1)!
    await userEvent.type(added, 'Climbs on Tuesdays')
    await userEvent.click(screen.getByRole('button', { name: 'Save 5 items' }))

    await waitFor(() => expect(bodies.save).toHaveLength(1))
    expect((bodies.save[0] as { memory_aids: unknown }).memory_aids).toEqual([
      { about: 't', text: 'Likes climbing' },
      { about: 't', text: 'Climbs on Tuesdays' },
    ])
  })
})
