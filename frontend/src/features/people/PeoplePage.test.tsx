import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

const ME = { id: 'u1', email: 'ela@example.com', is_admin: false, me: { id: 'me', name: 'Ela' } }

const person = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  how_we_met: '',
  work: '',
  birthday: null,
  tags: [],
  spaces: [] as { id: string; name: string; color: string }[],
  is_me: false,
  is_mine: true,
  owner: { id: 'me', name: 'Ela' },
  needs_details: false,
  last_talked_on: null,
  ...extra,
})

const CLIMBING = {
  id: 's1',
  name: 'Climbing club',
  color: 'teal',
  description: '',
  share_contact_details: false,
  role: 'owner',
  owner: { id: 'me', name: 'Ela' },
  people_count: 2,
  member_count: 2,
}

const EVERYONE = [
  person('me', 'Ela', { is_me: true }),
  person('emma', 'Emma Yılmaz', {
    how_we_met: 'University, Istanbul · 2015',
    last_talked_on: '2020-01-01',
  }),
  person('anna', 'Anna Kowalska', { needs_details: true }),
  person('oskar', 'Oskar', {
    how_we_met: 'Climbing club',
    spaces: [{ id: 's1', name: 'Climbing club', color: 'teal' }],
  }),
]

/** A fake API that filters like the real one does, and records the list requests. */
function server(people = EVERYONE) {
  const listRequests: URLSearchParams[] = []
  fakeServer({
    'GET /api/auth/me': () => json(ME),
    'GET /api/spaces': () => json({ items: [CLIMBING], count: 1 }),
    'GET /api/people': (request) => {
      const query = new URL(request.url).searchParams
      if (query.get('page_size') !== '1') listRequests.push(query)
      const search = (query.get('search') ?? '').toLowerCase()
      const items = people.filter(
        (p) =>
          p.name.toLowerCase().includes(search) &&
          (query.get('needs_details') !== 'true' || p.needs_details) &&
          (!query.get('space') || p.spaces.some((s) => s.id === query.get('space'))),
      )
      const size = Number(query.get('page_size') ?? 50)
      const page = Number(query.get('page') ?? 1)
      return json({ items: items.slice((page - 1) * size, page * size), count: items.length })
    },
  })
  return listRequests
}

const list = () => screen.findByRole('region', { name: 'People' })
const cards = async () =>
  within(await list())
    .queryAllByRole('article')
    .map((card) => card.getAttribute('aria-label'))

afterEach(clearCookies)

describe('People list', () => {
  it('shows everyone with how you met, when you last talked, or that details are missing', async () => {
    server()
    renderApp('/people')

    await waitFor(async () => expect(await cards()).toHaveLength(4))
    const emma = screen.getByRole('article', { name: 'Emma Yılmaz' })
    expect(emma).toHaveTextContent('University, Istanbul · 2015')
    expect(emma).toHaveTextContent(/years? ago/)
    expect(screen.getByRole('article', { name: 'Anna Kowalska' })).toHaveTextContent(
      /How do you know them\?.*Needs details/,
    )
    expect(screen.getByRole('article', { name: 'Ela' })).toHaveTextContent('You')
    expect(screen.getByText('4 in your notebook')).toBeInTheDocument()
  })

  it('opens a profile from its card', async () => {
    server()
    const router = renderApp('/people')

    await userEvent.click(await screen.findByRole('link', { name: /Emma Yılmaz/ }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/people/emma'))
  })

  it('searches on the server once you pause typing, and keeps it in the address', async () => {
    const requests = server()
    const router = renderApp('/people')
    await waitFor(async () => expect(await cards()).toHaveLength(4))

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search people' }), 'emma')

    await waitFor(async () => expect(await cards()).toEqual(['Emma Yılmaz']))
    expect(router.state.location.search).toEqual({ q: 'emma' })
    // One request for the whole word, not one per letter.
    expect(requests.map((query) => query.get('search'))).toEqual(['', 'emma'])
  })

  it('filters to the people who need details', async () => {
    server()
    renderApp('/people')

    await userEvent.click(await screen.findByRole('button', { name: 'Needs details · 1' }))

    await waitFor(async () => expect(await cards()).toEqual(['Anna Kowalska']))
  })

  it('filters by space and links to the space page', async () => {
    server()
    renderApp('/people')

    await userEvent.click(await screen.findByRole('button', { name: 'Climbing club' }))

    await waitFor(async () => expect(await cards()).toEqual(['Oskar']))
    expect(screen.getByRole('link', { name: 'Space page →' })).toHaveAttribute('href', '/spaces/s1')
    expect(screen.getByText('Shared with 2')).toBeInTheDocument()
  })

  it('says when nothing matches, and clears the filters', async () => {
    server()
    renderApp('/people?q=zzz')

    expect(await screen.findByText('No one matches.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

    await waitFor(async () => expect(await cards()).toHaveLength(4))
    expect(screen.getByRole('searchbox', { name: 'Search people' })).toHaveValue('')
  })

  it('welcomes you when only your own Me is in the book', async () => {
    server([EVERYONE[0]])
    renderApp('/people')

    expect(await screen.findByRole('heading', { name: 'Your book is empty' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add someone' })).toHaveAttribute('href', '/people/new')
  })

  it('loads 50 at a time', async () => {
    server([...Array(60)].map((_, i) => person(`p${i}`, `Person ${String(i).padStart(2, '0')}`)))
    renderApp('/people')
    await waitFor(async () => expect(await cards()).toHaveLength(50))

    await userEvent.click(screen.getByRole('button', { name: 'Show more' }))

    await waitFor(async () => expect(await cards()).toHaveLength(60))
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument()
  })

  it('switches to a grid of polaroids', async () => {
    server()
    const router = renderApp('/people')
    await waitFor(async () => expect(await cards()).toHaveLength(4))

    await userEvent.click(screen.getByRole('button', { name: 'Grid' }))

    await waitFor(async () => expect(await cards()).toHaveLength(0))
    expect(within(await list()).getAllByRole('link')).toHaveLength(4)
    expect(router.state.location.search).toEqual({ view: 'grid' })
  })
})
