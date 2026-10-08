import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'
import { setAppearance } from '@/lib/appearance'
import { formatDay } from '@/lib/dates'

const ME = {
  id: 'u1',
  email: 'ela@example.com',
  is_admin: false,
  me: { id: 'me', name: 'Ela Demir' },
}
const ELA = {
  id: 'me',
  name: 'Ela Demir',
  how_we_met: '',
  work: '',
  birthday: { day: 3, month: 4, year: null },
  tags: [],
  spaces: [],
  photo: null,
  is_me: true,
  is_mine: true,
  owner: { id: 'me', name: 'Ela Demir' },
  needs_details: false,
  last_talked_on: null,
  added_at: '2026-01-01T00:00:00Z',
  contact_methods: [],
  can_edit: true,
  can_delete: false,
  can_hide: false,
}
const device = (id: string, name: string, isCurrent = false) => ({
  id,
  device: name,
  ip: '10.0.0.1',
  last_seen: '2026-09-22T08:00:00Z',
  is_current: isCurrent,
})

type Write = { method: string; path: string; body: unknown }

const IMPORTS = [
  {
    id: 'i1',
    file_name: 'contacts.vcf',
    created_at: '2026-10-08T09:00:00Z',
    added: 5,
    merged: 1,
    undone_at: null,
  },
  {
    id: 'i0',
    file_name: 'old phone.vcf',
    created_at: '2026-09-30T09:00:00Z',
    added: 1,
    merged: 0,
    undone_at: '2026-10-01T09:00:00Z',
  },
]
const ref = (id: string, name: string) => ({ id, name })
type UndoPreview = { goes: object[]; stays: object[]; loses_details: object[] }
const PREVIEW: UndoPreview = {
  goes: [ref('p1', 'Chen Wei'), ref('p2', 'Greta Holm'), ref('p3', 'Lars Eriksen')],
  stays: [ref('p4', 'Ines Berg')],
  loses_details: [ref('p5', 'Emma')],
}

const RESTORABLE = {
  name: 'Ela Demir',
  email: 'ela@old.example.com',
  exported_at: '2026-10-03T09:00:00Z',
  people: 42,
  spaces: 3,
  photos: 12,
}
const SHARED =
  'Restore is for moving to a new server, so it only works while nothing in your book is shared.'

// jsdom's files can't go into a real form upload, so the two calls are faked here
// (queries.test.ts sends real ones).
const restores = vi.hoisted(() => [] as { file: string; email: string }[])
vi.mock('./queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./queries')>()),
  checkRestore: async (file: File) => {
    if (file.name === 'shared.zip') throw new ApiError(409, SHARED)
    return RESTORABLE
  },
  restoreBook: async (_queryClient: unknown, file: File, email: string) => {
    restores.push({ file: file.name, email })
    return RESTORABLE
  },
}))

function server({
  preview = () => PREVIEW,
  previewWait,
}: {
  /** What the undo preview says, asked each time. */
  preview?: () => UndoPreview
  /** Holds the preview's answer back until this settles. */
  previewWait?: () => Promise<void> | undefined
} = {}) {
  const writes: Write[] = []
  let settings = { nudges_on: true, default_interval_days: null as number | null }
  const record = async (request: Request) => {
    const body = ['DELETE'].includes(request.method) ? null : await request.json().catch(() => null)
    writes.push({ method: request.method, path: new URL(request.url).pathname, body })
    return body
  }
  fakeServer({
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/auth/me': () => json(ME),
    'GET /api/people/me': () => json(ELA),
    'GET /api/spaces': () =>
      json({
        items: [
          {
            id: 's1',
            name: 'Climbing club',
            color: 'teal',
            description: '',
            share_contact_details: false,
            role: 'owner',
            owner: { id: 'me', name: 'Ela Demir' },
            people_count: 6,
            member_count: 0,
          },
        ],
        count: 1,
      }),
    'GET /api/people': () => json({ items: [], count: 0 }),
    'GET /api/auth/devices': () =>
      json({
        items: [device('d1', 'Firefox on macOS', true), device('d2', 'Safari on iPhone')],
        count: 2,
      }),
    'DELETE /api/auth/devices/d2': async (request) => {
      await record(request)
      return new Response(null, { status: 204 })
    },
    'POST /api/auth/devices/sign-out-others': async (request) => {
      await record(request)
      return new Response(null, { status: 204 })
    },
    'POST /api/auth/password': async (request) => {
      const body = (await record(request)) as { current_password: string }
      return body.current_password === 'right one'
        ? new Response(null, { status: 204 })
        : json(
            {
              detail: [
                { loc: ['body', 'current_password'], msg: "That's not your current password." },
              ],
            },
            422,
          )
    },
    'GET /api/keep-in-touch/settings': () => json(settings),
    'PUT /api/keep-in-touch/settings': async (request) => {
      settings = (await record(request)) as typeof settings
      return json(settings)
    },
    'GET /api/about': () => json({ version: '0.1.0', source_url: 'https://example.com/folkbook' }),
    'GET /api/export/summary': () => json({ people: 148, photos: 1, size: 84_200_000 }),
    'GET /api/imports': () => json({ items: IMPORTS, count: IMPORTS.length }),
    'GET /api/imports/i1/undo-preview': async () => {
      await previewWait?.()
      return json(preview())
    },
    'POST /api/imports/i1/undo': async (request) => {
      await record(request)
      return json({ ...IMPORTS[0], undone_at: '2026-10-08T10:00:00Z' })
    },
    'POST /api/imports/i1/redo': async (request) => {
      await record(request)
      return json(IMPORTS[0])
    },
  })
  return writes
}

const page = (title: string) => screen.findByRole('region', { name: title })

afterEach(() => {
  clearCookies()
  setAppearance({ theme: 'system', motion: 'system' })
})

describe('settings', () => {
  it('shows your account and signs other devices out', async () => {
    const writes = server()
    renderApp('/settings/profile')
    const profile = await page('Profile & account')

    expect(await within(profile).findByText('Ela Demir')).toBeInTheDocument()
    expect(within(profile).getByText(/Birthday .*3/)).toBeInTheDocument()
    expect(within(profile).getByText('ela@example.com')).toBeInTheDocument()
    expect(await within(profile).findByText('This device')).toBeInTheDocument()

    await userEvent.click(within(profile).getByRole('button', { name: 'Sign out' }))
    await userEvent.click(within(profile).getByRole('button', { name: 'Sign out everywhere else' }))

    await waitFor(() => expect(writes).toHaveLength(2))
    expect(writes.map((write) => `${write.method} ${write.path}`)).toEqual([
      'DELETE /api/auth/devices/d2',
      'POST /api/auth/devices/sign-out-others',
    ])
  })

  it('changes the password, and says when the current one is wrong', async () => {
    const writes = server()
    renderApp('/settings/profile')
    const profile = await page('Profile & account')

    await userEvent.click(within(profile).getByRole('button', { name: 'Change password' }))
    await userEvent.type(within(profile).getByLabelText('Current password'), 'wrong one')
    await userEvent.type(within(profile).getByLabelText('New password'), 'a fresh passphrase')
    await userEvent.type(within(profile).getByLabelText('New password again'), 'a fresh passphrase')
    await userEvent.click(within(profile).getByRole('button', { name: 'Save password' }))
    expect(await within(profile).findByRole('alert')).toHaveTextContent(
      "That's not your current password.",
    )

    await userEvent.clear(within(profile).getByLabelText('Current password'))
    await userEvent.type(within(profile).getByLabelText('Current password'), 'right one')
    await userEvent.click(within(profile).getByRole('button', { name: 'Save password' }))

    expect(await screen.findByText('Password changed')).toBeInTheDocument()
    expect(writes.at(-1)).toEqual({
      method: 'POST',
      path: '/api/auth/password',
      body: { current_password: 'right one', new_password: 'a fresh passphrase' },
    })
  })

  it('turns nudges off and sets a default interval', async () => {
    const writes = server()
    renderApp('/settings/reminders')
    const reminders = await page('Reminders')

    await userEvent.click(
      await within(reminders).findByRole('checkbox', { name: 'Show nudges on Today' }),
    )
    await waitFor(() => expect(writes).toHaveLength(1))
    await userEvent.selectOptions(
      within(reminders).getByLabelText('Keep in touch'),
      'Every 2 months',
    )

    await waitFor(() => expect(writes).toHaveLength(2))
    expect(writes.map((write) => write.body)).toEqual([
      { nudges_on: false, default_interval_days: null },
      { nudges_on: false, default_interval_days: 60 },
    ])
  })

  it('picks a theme and reduces motion on this device', async () => {
    server()
    renderApp('/settings/appearance')
    const appearance = await page('Appearance')

    await userEvent.click(
      within(appearance).getByRole('radio', { name: 'Dark: notebook at night' }),
    )
    await userEvent.click(
      within(appearance).getByRole('checkbox', { name: 'Reduce motion on this device' }),
    )

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.dataset.motion).toBe('reduce')
  })

  it('links to the source code, as the AGPL asks', async () => {
    server()
    renderApp('/settings/about')
    const about = await page('About')

    expect(await within(about).findByText('Version 0.1.0')).toBeInTheDocument()
    expect(within(about).getByRole('link', { name: 'Source code' })).toHaveAttribute(
      'href',
      'https://example.com/folkbook',
    )
  })

  it('links to the contacts import', async () => {
    server()
    renderApp('/settings/import-export')
    const settings = await page('Import / export')

    expect(await within(settings).findByRole('link', { name: 'Import contacts' })).toHaveAttribute(
      'href',
      '/people/import',
    )
  })

  it('lists recent imports', async () => {
    server()
    renderApp('/settings/import-export')
    const recent = await screen.findByRole('list', { name: 'Recent imports' })

    const [latest, older] = within(recent).getAllByRole('listitem')
    expect(within(latest).getByText('contacts.vcf')).toBeInTheDocument()
    expect(
      within(latest).getByText(`${formatDay('2026-10-08')} · 5 people added`),
    ).toBeInTheDocument()
    expect(
      within(older).getByText(`${formatDay('2026-09-30')} · 1 person added · undone`),
    ).toBeInTheDocument()
    expect(within(older).queryByRole('button', { name: /Undo/ })).not.toBeInTheDocument()
  })

  it("shows an import's people", async () => {
    server()
    renderApp('/settings/import-export')
    const recent = await screen.findByRole('list', { name: 'Recent imports' })

    expect(
      within(within(recent).getAllByRole('listitem')[0]).getByRole('link', {
        name: 'Show these people',
      }),
    ).toHaveAttribute('href', '/people?import=i1')
  })

  it('undoes an import after saying what happens, and can bring it back', async () => {
    const writes = server()
    renderApp('/settings/import-export')
    const recent = await screen.findByRole('list', { name: 'Recent imports' })

    await userEvent.click(within(recent).getByRole('button', { name: 'Undo this import…' }))
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Undo the import of contacts.vcf?',
    })
    expect(await within(dialog).findByText(/3 people go/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Chen Wei, Greta Holm and Lars Eriksen/)).toBeInTheDocument()
    expect(within(dialog).getByText(/1 you've written about since stays/)).toBeInTheDocument()
    expect(
      within(dialog).getByText(/1 person you had loses the details this import added/),
    ).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Undo import' }))

    expect(await screen.findByText('Import undone')).toBeInTheDocument()
    expect(writes).toEqual([{ method: 'POST', path: '/api/imports/i1/undo', body: null }])
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() =>
      expect(writes.at(-1)).toEqual({ method: 'POST', path: '/api/imports/i1/redo', body: null }),
    )
  })

  it('says it is working out who goes, and when nobody does', async () => {
    let answer = () => {}
    const waiting = new Promise<void>((resolve) => (answer = resolve))
    server({
      preview: () => ({ goes: [], stays: [ref('p4', 'Ines Berg')], loses_details: [] }),
      previewWait: () => waiting,
    })
    renderApp('/settings/import-export')
    const recent = await screen.findByRole('list', { name: 'Recent imports' })

    await userEvent.click(within(recent).getByRole('button', { name: 'Undo this import…' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Working out who goes…')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Undo import' })).toBeDisabled()
    answer()

    expect(await within(dialog).findByText('Nobody goes')).toBeInTheDocument()
    expect(within(dialog).queryByText('Working out who goes…')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Undo import' })).toBeEnabled()
  })

  it('never shows the last numbers again while it asks anew', async () => {
    let current = PREVIEW
    let wait: Promise<void> | undefined
    server({ preview: () => current, previewWait: () => wait })
    renderApp('/settings/import-export')
    const recent = await screen.findByRole('list', { name: 'Recent imports' })
    const open = async () => {
      await userEvent.click(within(recent).getByRole('button', { name: 'Undo this import…' }))
      return screen.findByRole('alertdialog')
    }
    await within(await open()).findByText(/3 people go/)
    await userEvent.click(screen.getByRole('button', { name: 'Keep' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())

    let answer = () => {}
    wait = new Promise<void>((resolve) => (answer = resolve))
    current = { ...PREVIEW, goes: [ref('p1', 'Chen Wei')] }
    const dialog = await open()

    expect(within(dialog).getByText('Working out who goes…')).toBeInTheDocument()
    expect(within(dialog).queryByText(/3 people go/)).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Undo import' })).toBeDisabled()
    answer()
    expect(await within(dialog).findByText(/1 person goes/)).toBeInTheDocument()
  })

  it('exports everything as one .zip', async () => {
    server()
    renderApp('/settings/import-export')
    const exports = await page('Import / export')

    expect(
      await within(exports).findByText(/148 people · 1 photo · ~84 MB zip/),
    ).toBeInTheDocument()
    expect(within(exports).getByRole('link', { name: 'Export .zip' })).toHaveAttribute(
      'href',
      '/api/export/everything',
    )
    expect(within(exports).getByText(/include your private notes/)).toBeInTheDocument()
  })

  it('exports contacts as a .vcf, for everyone or one space', async () => {
    server()
    renderApp('/settings/import-export')
    const exports = await page('Import / export')
    const link = () => within(exports).getByRole('link', { name: 'Export' })

    expect(await within(exports).findByText('Contacts only (.vcf)')).toBeInTheDocument()
    expect(link()).toHaveAttribute('href', '/api/export/contacts')

    await userEvent.selectOptions(
      within(exports).getByRole('combobox', { name: 'Which people' }),
      await within(exports).findByRole('option', { name: 'Climbing club' }),
    )
    expect(link()).toHaveAttribute('href', '/api/export/contacts?space=s1')
  })

  it('restores a full export once you type your email', async () => {
    server()
    renderApp('/settings/import-export')
    const exports = await page('Import / export')

    await userEvent.upload(
      within(exports).getByLabelText('Choose .zip'),
      new File(['zip'], 'folkbook.zip', { type: 'application/zip' }),
    )
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Replace everything in your book?',
    })
    expect(within(dialog).getByText(/Ela Demir's book \(ela@old.example.com\)/)).toBeVisible()
    expect(within(dialog).getByText('42 people · 3 spaces · 12 photos')).toBeVisible()
    expect(within(dialog).getByText(/148 people in your book now/)).toBeVisible()
    expect(
      within(dialog).getByRole('link', { name: 'Download a copy of your book first' }),
    ).toHaveAttribute('href', '/api/export/everything')
    const restore = within(dialog).getByRole('button', { name: 'Restore' })
    expect(restore).toBeDisabled()

    await userEvent.type(within(dialog).getByLabelText(/Type your email/), 'Ela@example.com')
    await userEvent.click(restore)

    await waitFor(() =>
      expect(restores).toEqual([{ file: 'folkbook.zip', email: 'Ela@example.com' }]),
    )
    expect(await screen.findByText('Your book is restored')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it("says why a file can't be restored before asking anything", async () => {
    server()
    renderApp('/settings/import-export')
    const exports = await page('Import / export')

    await userEvent.upload(
      within(exports).getByLabelText('Choose .zip'),
      new File(['zip'], 'shared.zip', { type: 'application/zip' }),
    )

    expect(await within(exports).findByRole('alert')).toHaveTextContent(/nothing in your book/)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('lists the sections, without the admin ones for members', async () => {
    server()
    renderApp('/settings')

    const nav = await screen.findByRole('navigation', { name: 'Settings' })
    expect(within(nav).getByRole('link', { name: /Appearance/ })).toHaveAttribute(
      'href',
      '/settings/appearance',
    )
    expect(within(nav).queryByText('Server · admin')).not.toBeInTheDocument()
  })

  it.each(['/settings/users', '/settings/invites'])(
    'sends members who open %s back to their own settings',
    async (path) => {
      server()
      const router = renderApp(path)

      await waitFor(() => expect(router.state.location.pathname).toBe('/settings'))
      expect(await screen.findByRole('navigation', { name: 'Settings' })).toBeInTheDocument()
    },
  )
})
