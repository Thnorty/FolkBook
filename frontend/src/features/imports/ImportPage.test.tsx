import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

const ME = { id: 'u1', email: 'ela@example.com', is_admin: false, me: { id: 'me', name: 'Ela' } }
const noMatch = { emails: [], birthday: null, work: '', has_photo: false, match: null }
const match = (fields: object) => ({
  owner: 'Ela Demir',
  photo: null,
  phones: [],
  emails: [],
  spaces: [],
  sure: true,
  can_merge: true,
  by_details: false,
  ...fields,
})
const PREVIEW = {
  file_name: 'contacts.vcf',
  skipped: 0,
  contacts: [
    {
      ...noMatch,
      index: 0,
      name: 'Greta Holm',
      phones: [{ value: '+46 73 111 22 33', label: 'mobile' }],
    },
    {
      ...noMatch,
      index: 1,
      name: 'Anna K.',
      phones: [{ value: '+48 601 234 567', label: '' }],
      emails: [{ value: 'anna.k@post.pl', label: '' }],
      match: match({
        person: { id: 'anna', name: 'Anna Kowalska' },
        spaces: [{ id: 's2', name: "Uni '15", color: 'plum' }],
        reason: 'initial',
        sure: false,
      }),
    },
    {
      ...noMatch,
      index: 2,
      name: 'Ines Berg',
      phones: [{ value: '070 555 12 90', label: '' }],
      match: match({
        person: { id: 'ines', name: 'Ines' },
        phones: ['+46 70 555 12 90'],
        reason: 'phone',
        by_details: true,
      }),
    },
  ],
}

// jsdom's files can't go into a real form upload, so the two calls are faked.
const calls = vi.hoisted(() => ({ runs: [] as unknown[] }))
vi.mock('./queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./queries')>()),
  previewImport: async (file: File) => {
    if (file.name === 'broken.vcf') {
      throw new ApiError(422, [
        { loc: ['body', 'file'], msg: "That file isn't a .vcf contacts file." },
      ])
    }
    return PREVIEW
  },
  runImport: async (_queryClient: unknown, _file: File, choices: unknown) => {
    calls.runs.push(choices)
    return { import_id: 'i1', added: 1, merged: 0, left_out: 2, space: null }
  },
}))

function server() {
  fakeServer({
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/auth/me': () => json(ME),
    'GET /api/spaces': () => json({ items: [], count: 0 }),
    'GET /api/people': () => json({ items: [], count: 0 }),
    'GET /api/today/access-ended': () => json([]),
  })
}

async function upload(name = 'contacts.vcf') {
  server()
  renderApp('/people/import')
  const page = await screen.findByRole('main')
  await userEvent.upload(
    await within(page).findByLabelText('Choose a file'),
    new File(['BEGIN:VCARD'], name, { type: 'text/vcard' }),
  )
  return page
}

afterEach(() => {
  clearCookies()
  calls.runs = []
})

describe('importing contacts', () => {
  it('uploads a file and lists its contacts, none picked', async () => {
    const page = await upload()

    expect(await within(page).findByText('3 contacts in contacts.vcf')).toBeInTheDocument()
    const boxes = within(page).getAllByRole('checkbox', { name: /Greta|Anna|Ines/ })
    expect(boxes.map((box) => (box as HTMLInputElement).checked)).toEqual([false, false, false])
    expect(within(page).getByRole('button', { name: 'Continue with 0' })).toBeDisabled()

    await userEvent.click(within(page).getByRole('checkbox', { name: /Greta Holm/ }))

    expect(within(page).getByRole('button', { name: 'Continue with 1' })).toBeEnabled()
  })

  it('searches, and hides people already in your book', async () => {
    const page = await upload()
    const names = () => within(page).getAllByRole('checkbox', { name: /Greta|Anna|Ines/ })

    expect(within(page).getByText('Maybe in your book')).toBeInTheDocument()

    await userEvent.type(within(page).getByRole('searchbox', { name: 'Search contacts' }), 'gre')
    expect(names()).toHaveLength(1)

    await userEvent.clear(within(page).getByRole('searchbox', { name: 'Search contacts' }))
    await userEvent.click(
      within(page).getByRole('checkbox', { name: 'Hide 1 already in your book' }),
    )
    expect(names().map((box) => box.closest('label')?.textContent)).toEqual([
      expect.stringContaining('Greta Holm'),
      expect.stringContaining('Anna K.'),
    ])
  })

  it("says why a file can't be read", async () => {
    const page = await upload('broken.vcf')

    expect(await within(page).findByRole('alert')).toHaveTextContent(
      "That file isn't a .vcf contacts file.",
    )
    expect(within(page).getByText('Nothing is added until the last step')).toBeInTheDocument()
  })

  it('shows the steps', async () => {
    const page = await upload()
    await within(page).findByText('3 contacts in contacts.vcf')

    const steps = within(page).getByRole('list', { name: 'Steps' })
    expect(within(steps).getByText('Choose').closest('li')).toHaveAttribute('aria-current', 'step')
    expect(within(steps).getByText('Upload').closest('li')).toHaveTextContent('done')
  })
})
