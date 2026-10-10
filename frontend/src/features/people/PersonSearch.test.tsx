import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '@/api/query'
import { fakeServer, json } from '@/test/fakeServer'
import { PersonSearch } from './PersonSearch'

const person = (id: string, name: string) => ({
  id,
  name,
  how_we_met: '',
  work: '',
  birthday: null,
  tags: [],
  spaces: [],
  photo: null,
  is_me: id === 'me',
  is_mine: true,
  owner: { id: 'me', name: 'Ela' },
  needs_details: false,
  last_talked_on: null,
})

const AYSE = person('ayse', 'Ayşe Demir')
const AYLIN = person('aylin', 'Aylin Kaya')

function renderSearch(props: Partial<Parameters<typeof PersonSearch>[0]> = {}) {
  fakeServer({
    'GET /api/people': (request) =>
      new URL(request.url).searchParams.get('search') === 'ay'
        ? json({ items: [AYSE, AYLIN, person('me', 'Ela Yılmaz')], count: 3 })
        : json({ items: [], count: 0 }),
  })
  const onPick = vi.fn()
  render(
    <QueryClientProvider client={createQueryClient()}>
      <PersonSearch
        id="who"
        label="Who?"
        placeholder="Search your notebook"
        exclude={['me']}
        onPick={onPick}
        {...props}
      />
    </QueryClientProvider>,
  )
  return onPick
}

describe('PersonSearch', () => {
  it('lists the matches, minus the people left out, and picks one', async () => {
    const onPick = renderSearch()

    await userEvent.type(screen.getByLabelText('Who?'), 'ay')

    const people = await screen.findByRole('list', { name: 'People' })
    expect(await screen.findByRole('button', { name: /Aylin Kaya/ })).toBeInTheDocument()
    expect(people).toHaveTextContent('Ayşe Demir')
    expect(people).not.toHaveTextContent('Ela Yılmaz')

    await userEvent.click(screen.getByRole('button', { name: /Aylin Kaya/ }))
    expect(onPick).toHaveBeenCalledWith(AYLIN)
  })

  it('adds an extra row below the matches', async () => {
    renderSearch({ extra: (search) => <span>Create “{search}”</span> })

    await userEvent.type(screen.getByLabelText('Who?'), 'ay')

    expect(await screen.findByText('Create “ay”')).toBeInTheDocument()
  })

  it('shows no list while the box is blank', () => {
    renderSearch()

    expect(screen.queryByRole('list', { name: 'People' })).not.toBeInTheDocument()
  })
})
