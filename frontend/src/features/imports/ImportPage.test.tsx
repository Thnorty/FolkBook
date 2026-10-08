import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

const ME = { id: 'u1', email: 'ela@example.com', is_admin: false, me: { id: 'me', name: 'Ela' } }
const noMatch = { emails: [], birthday: null, work: '', has_photo: false, match: null }
const adds = (fields: object = {}) => ({
  phones: [],
  emails: [],
  work: '',
  birthday: null,
  photo: false,
  note: false,
  ...fields,
})
const match = (fields: object) => ({
  owner: 'Ela Demir',
  photo: null,
  phones: [],
  emails: [],
  spaces: [],
  sure: true,
  can_merge: true,
  by_details: false,
  adds: adds(),
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
        adds: adds({ phones: ['+48 601 234 567'], emails: ['anna.k@post.pl'], work: 'Acme' }),
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
const calls = vi.hoisted(() => ({
  runs: [] as unknown[],
  preview: null as unknown,
  result: null as unknown,
}))
vi.mock('./queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./queries')>()),
  previewImport: async (file: File) => {
    if (file.name === 'broken.vcf') {
      throw new ApiError(422, [
        { loc: ['body', 'file'], msg: "That file isn't a .vcf contacts file." },
      ])
    }
    return calls.preview ?? PREVIEW
  },
  runImport: async (_queryClient: unknown, _file: File, choices: unknown) => {
    calls.runs.push(choices)
    return calls.result ?? { import_id: 'i1', added: 1, merged: 0, left_out: 2, space: null }
  },
}))

function server() {
  fakeServer({
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/auth/me': () => json(ME),
    'GET /api/spaces': () => json({ items: SPACES, count: SPACES.length }),
    'GET /api/spaces/s3/members': () =>
      json([
        { user_id: 'u1', name: 'Ela', role: 'owner', is_you: true },
        { user_id: 'u2', name: 'Deniz Kaya', role: 'editor', is_you: false },
        { user_id: 'u3', name: 'Kaan Öz', role: 'viewer', is_you: false },
      ]),
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
  localStorage.clear()
  calls.runs = []
  calls.preview = null
  calls.result = null
})

const space = (id: string, name: string, role: string, memberCount: number) => ({
  id,
  name,
  color: 'teal',
  description: '',
  share_contact_details: false,
  role,
  owner: { id: 'me', name: 'Ela' },
  people_count: 3,
  member_count: memberCount,
})
const SPACES = [
  space('s1', 'Work', 'owner', 0),
  space('s3', 'Climbing club', 'owner', 2),
  space('s4', 'Hackathon', 'viewer', 3),
]

/** Upload, tick these contacts, and continue. */
async function pick(...names: string[]) {
  const page = await upload()
  await within(page).findByText(/contacts in contacts.vcf/)
  for (const name of names) {
    await userEvent.click(within(page).getByRole('checkbox', { name: new RegExp(name) }))
  }
  await userEvent.click(within(page).getByRole('button', { name: /^Continue with/ }))
  return page
}

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

  it('says how big a file can be', async () => {
    server()
    renderApp('/people/import')

    expect(
      await screen.findByText(
        'Up to 20 MB. A bigger export? Export it without photos, or in parts.',
      ),
    ).toBeInTheDocument()
  })

  it('shows the steps', async () => {
    const page = await upload()
    await within(page).findByText('3 contacts in contacts.vcf')

    const steps = within(page).getByRole('list', { name: 'Steps' })
    expect(within(steps).getByText('Choose').closest('li')).toHaveAttribute('aria-current', 'step')
    expect(within(steps).getByText('Upload').closest('li')).toHaveTextContent('done')
  })

  it('asks about each duplicate, then which space', async () => {
    const page = await pick('Anna K.', 'Ines Berg')

    expect(within(page).getByText('Looks like Anna K. already exists')).toBeInTheDocument()
    expect(within(page).getByText(/Same first name and initial/)).toBeInTheDocument()
    expect(within(page).getByText('Anna Kowalska')).toBeInTheDocument()
    expect(within(page).getByText('anna.k@post.pl').closest('ins')).not.toBeNull()
    expect(within(page).getByText('Merge also fills in their work.')).toBeInTheDocument()
    expect(within(page).getByText('1 of 2 possible duplicates')).toBeInTheDocument()
    await userEvent.click(within(page).getByRole('button', { name: 'Merge' }))

    expect(within(page).getByText('Looks like Ines Berg already exists')).toBeInTheDocument()
    expect(within(page).getByText(/Same phone number/)).toBeInTheDocument()
    // Already theirs, though written differently: not something the merge adds.
    expect(within(page).getByText('070 555 12 90').closest('ins')).toBeNull()
    await userEvent.click(within(page).getByRole('button', { name: 'Import as new' }))

    expect(within(page).getByText('Put the new person in a space?')).toBeInTheDocument()
    expect(within(page).getByText(/Anna Kowalska, merged/)).toBeInTheDocument()
    await userEvent.click(within(page).getByRole('button', { name: 'Import 1 person' }))

    await waitFor(() =>
      expect(calls.runs).toEqual([
        {
          picked: [
            { index: 1, action: 'merge', into: 'anna' },
            { index: 2, action: 'new' },
          ],
          space: null,
        },
      ]),
    )
  })

  it('skips the duplicates step when there are none', async () => {
    const page = await pick('Greta Holm')

    expect(within(page).getByText('Put the new person in a space?')).toBeInTheDocument()
    expect(within(page).queryByText(/already exists/)).not.toBeInTheDocument()
  })

  it('only lets you merge into your own people', async () => {
    calls.preview = {
      ...PREVIEW,
      contacts: [
        {
          ...noMatch,
          index: 0,
          name: 'Tom',
          phones: [],
          match: match({
            person: { id: 'tom', name: 'Tom Bergqvist' },
            owner: 'Defne Aydın',
            reason: 'name',
            can_merge: false,
            adds: null,
          }),
        },
      ],
    }
    const page = await pick('Tom')

    expect(within(page).getByText("Shared by Defne, so you can't merge into them")).toBeVisible()
    expect(within(page).queryByRole('button', { name: 'Merge' })).not.toBeInTheDocument()
    await userEvent.click(within(page).getByRole('button', { name: 'Skip' }))
    expect(within(page).getByText(/Nobody new to add/)).toBeInTheDocument()
  })

  it("puts the new people in a space, asking first if it's shared", async () => {
    const page = await pick('Greta Holm')

    expect(within(page).queryByRole('radio', { name: 'Hackathon' })).not.toBeInTheDocument()
    await userEvent.click(within(page).getByRole('radio', { name: 'Climbing club' }))
    const dialog = await screen.findByRole('alertdialog', {
      name: '1 person will be visible to 2 people',
    })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add them to Climbing club' }))
    expect(within(page).getByRole('radio', { name: 'Climbing club' })).toBeChecked()
    await userEvent.click(within(page).getByRole('button', { name: 'Import 1 person' }))

    await waitFor(() =>
      expect(calls.runs).toEqual([{ picked: [{ index: 0, action: 'new' }], space: 's3' }]),
    )
  })

  it('says what happened', async () => {
    calls.result = {
      import_id: 'i1',
      added: 5,
      merged: 1,
      left_out: 208,
      space: { id: 's1', name: 'Work', color: 'teal' },
    }
    const page = await pick('Anna K.', 'Greta Holm')
    await userEvent.click(within(page).getByRole('button', { name: 'Merge' }))
    await userEvent.click(within(page).getByRole('button', { name: /^Import/ }))

    expect(await within(page).findByText('Imported 5 new people, in Work')).toBeInTheDocument()
    expect(within(page).getByText('1 merged into Anna Kowalska')).toBeInTheDocument()
    expect(within(page).getByText('208 left out — they stay in your phone')).toBeInTheDocument()
    expect(within(page).getByRole('link', { name: 'Later' })).toHaveAttribute('href', '/people')
    expect(within(page).getByRole('link', { name: 'Show them' })).toHaveAttribute(
      'href',
      '/people?needs=true',
    )
  })

  it('names someone two contacts merge into once', async () => {
    const ines = PREVIEW.contacts[2]
    calls.preview = {
      ...PREVIEW,
      contacts: [...PREVIEW.contacts, { ...ines, index: 3, name: 'Ines B.' }],
    }
    calls.result = { import_id: 'i1', added: 0, merged: 2, left_out: 2, space: null }
    const page = await pick('Ines Berg', 'Ines B\\.')
    await userEvent.click(within(page).getByRole('button', { name: 'Merge' }))
    await userEvent.click(within(page).getByRole('button', { name: 'Merge' }))

    expect(within(page).getAllByText(/Ines, merged/)).toHaveLength(1)
    await userEvent.click(within(page).getByRole('button', { name: 'Merge 2' }))
    expect(await within(page).findByText('2 merged into Ines')).toBeInTheDocument()
  })
})
