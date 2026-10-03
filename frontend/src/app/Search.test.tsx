import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
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
  added_at: '2026-01-01T00:00:00Z',
  ...extra,
})

const CLIMBING = {
  people: [person('kaan', 'Kaan Aras', { how_we_met: 'Climbing club' })],
  spaces: [],
  memory_aids: [{ id: 'a1', text: 'Climbs at Bouldergarten', person: ref('tom', 'Tom Bergqvist') }],
  notes: [{ person: ref('sofia', 'Sofia Lind'), snippet: '…first time climbing outdoors…' }],
  did_you_mean: null,
}
const NOTHING = {
  people: [],
  spaces: [],
  memory_aids: [],
  notes: [],
  did_you_mean: ref('zeynep', 'Zeynep Demir'),
}

/** `slow`: search answers after a moment, like a real server, so results arrive late. */
function server({ slow = false } = {}) {
  const searched: string[] = []
  fakeServer({
    'GET /api/auth/me': () => json(ME),
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/spaces': () => json({ items: [], count: 0 }),
    'GET /api/people': () => json({ items: [], count: 0 }),
    'GET /api/search': async (request) => {
      const q = new URL(request.url).searchParams.get('q') ?? ''
      searched.push(q)
      if (slow) await new Promise((resolve) => setTimeout(resolve, 300))
      return json(q.startsWith('clim') ? CLIMBING : NOTHING)
    },
    'GET /api/people/sofia': () => json({ ...person('sofia', 'Sofia Lind'), contact_methods: [] }),
  })
  return searched
}

async function openPalette() {
  await screen.findByRole('heading', { level: 1, name: 'People' }) // shortcuts listen once loaded
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
  return screen.findByRole('dialog', { name: 'Command palette' })
}

afterEach(clearCookies)

describe('search', () => {
  it('groups what matches, and opens the person a note is about', async () => {
    const searched = server()
    const router = renderApp('/people')
    const palette = await openPalette()

    await userEvent.type(within(palette).getByRole('combobox'), 'clim')

    const people = await within(palette).findByRole('group', { name: 'People' })
    expect(
      within(people).getByRole('option', { name: /Kaan Aras\s*Climbing club/ }),
    ).toBeInTheDocument()
    expect(
      within(palette).getByRole('option', { name: /Climbs at Bouldergarten\s*on Tom Bergqvist/ }),
    ).toBeInTheDocument()
    await userEvent.click(within(palette).getByRole('option', { name: /first time climbing/ }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/people/sofia'))
    expect(searched.at(-1)).toBe('clim')
  })

  it('highlights the first result once results arrive, so Enter opens it', async () => {
    server({ slow: true })
    const router = renderApp('/people')
    const palette = await openPalette()

    // Typed at once, as when pasting: the page shortcuts that matched before are gone.
    fireEvent.change(within(palette).getByRole('combobox'), { target: { value: 'clim' } })
    const people = await within(palette).findByRole('group', { name: 'People' })
    await waitFor(() =>
      expect(within(people).getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true'),
    )
    await userEvent.keyboard('{Enter}')

    await waitFor(() => expect(router.state.location.pathname).toBe('/people/kaan'))
  })

  it('suggests a close name, or adding someone new, when nothing matches', async () => {
    server()
    renderApp('/people')
    const palette = await openPalette()

    await userEvent.type(within(palette).getByRole('combobox'), 'tahir')

    expect(await within(palette).findByText('Nothing matches “tahir”')).toBeInTheDocument()
    expect(within(palette).getByRole('option', { name: 'Zeynep Demir' })).toBeInTheDocument()
    await userEvent.click(
      within(palette).getByRole('option', { name: /Add “Tahir” as a new person/ }),
    )

    const form = await screen.findByRole('dialog', { name: 'Add someone' })
    expect(within(form).getByLabelText('Name')).toHaveValue('Tahir')
  })

  it('is a page on phones', async () => {
    server()
    renderApp('/search')

    await userEvent.type(await screen.findByRole('combobox'), 'clim')

    expect(await screen.findByRole('option', { name: /Kaan Aras/ })).toBeInTheDocument()
  })
})
