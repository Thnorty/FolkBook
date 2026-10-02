import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'
import { kindOf, linkFor } from './connectionKinds'
import type { Relationship } from './queries'

const ME = { id: 'u1', email: 'ela@example.com', is_admin: false, me: { id: 'me', name: 'Ela' } }
const ref = (id: string, name: string) => ({ id, name })
const FRIENDS = { id: 's1', name: 'Friends', color: 'sage' }

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
  contact_methods: [],
  can_edit: true,
  can_delete: true,
  ...extra,
})

const link = (
  id: string,
  a: [string, string],
  b: [string, string],
  type: Relationship['type'],
  extra = {},
): Relationship => ({
  id,
  person_a: ref(...a),
  person_b: ref(...b),
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

const EMMA: [string, string] = ['emma', 'Emma Yılmaz']
const KEREM: [string, string] = ['kerem', 'Kerem Yılmaz']
const PARTNERS = link('l1', EMMA, KEREM, 'partner', { started_on: '2019-06-01' })
const family = (id: string, name: string, relation: string, extra = {}) => ({
  person: ref(id, name),
  relation,
  derived: false,
  former: false,
  parent_type: null,
  direct_link_id: null,
  ...extra,
})

type Write = { method: string; path: string; body: unknown }

function server() {
  const writes: Write[] = []
  const record = async (request: Request) => {
    const body = request.method === 'DELETE' ? null : await request.json().catch(() => null)
    writes.push({ method: request.method, path: new URL(request.url).pathname, body })
    return body as Record<string, unknown>
  }
  const empty = () => json({ items: [], count: 0 })

  fakeServer({
    'GET /api/auth/me': () => json(ME),
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/spaces': () =>
      json({ items: [{ ...FRIENDS, role: 'owner', description: '' }], count: 1 }),
    'GET /api/people': (request) =>
      new URL(request.url).searchParams.get('search')
        ? json({ items: [person('kerem', 'Kerem Yılmaz', { spaces: [FRIENDS] })], count: 1 })
        : empty(),
    'GET /api/people/emma': () => json(person('emma', 'Emma Yılmaz', { spaces: [FRIENDS] })),
    'GET /api/people/emma/family': () =>
      json([
        family('kerem', 'Kerem Yılmaz', 'partner'),
        family('nazli', 'Nazlı Yılmaz', 'parent_in_law', { derived: true }),
      ]),
    'GET /api/relationships': (request) =>
      new URL(request.url).searchParams.get('family') === 'true'
        ? json({ items: [PARTNERS], count: 1 })
        : json({
            items: [link('l2', EMMA, ['defne', 'Defne Aydın'], 'friend', { is_mine: false })],
            count: 1,
          }),
    'GET /api/relationships/l1/end-preview': () =>
      json([family('nazli', 'Nazlı Yılmaz', 'parent_in_law', { derived: true, former: true })]),
    'GET /api/memory-aids': empty,
    'GET /api/people/emma/note': () => json({ body: '', updated_at: null }),
    'GET /api/interactions': empty,
    'GET /api/keep-in-touch/emma': () =>
      json({ interval_days: null, snoozed_until: null, stopped: false }),
    'POST /api/people': async (request) =>
      json(person('arda', String((await record(request)).name)), 201),
    'POST /api/relationships': async (request) => {
      const body = await record(request)
      const [a, b] = [body.person_a_id, body.person_b_id].map((id) =>
        ref(String(id), id === 'emma' ? 'Emma Yılmaz' : 'Kerem Yılmaz'),
      )
      return json({ ...PARTNERS, ...body, id: 'l9', person_a: a, person_b: b }, 201)
    },
    'PATCH /api/relationships/l1': async (request) =>
      json({ ...PARTNERS, ...(await record(request)) }),
    'POST /api/relationships/l1/end': async (request) =>
      json({ ...PARTNERS, is_former: true, ...(await record(request)) }),
    'POST /api/relationships/l1/reopen': async (request) => {
      await record(request)
      return json(PARTNERS)
    },
    'DELETE /api/relationships/l1': async (request) => {
      await record(request)
      return new Response(null, { status: 204 })
    },
  })
  return writes
}

async function openConnections() {
  renderApp('/people/emma')
  return screen.findByRole('region', { name: 'Connections' })
}

async function openMenu(section: HTMLElement, name: string) {
  await userEvent.click(
    await within(section).findByRole('button', { name: `${name}: change or end` }),
  )
}

const save = (dialog: HTMLElement) => fireEvent.keyDown(dialog, { key: 'Enter', ctrlKey: true })

afterEach(clearCookies)

describe('connecting people', () => {
  it('finds someone and links them, in a space you share', async () => {
    const writes = server()
    const section = await openConnections()

    await userEvent.click(within(section).getByRole('button', { name: 'Add' }))
    const dialog = await screen.findByRole('dialog', { name: 'Connect Emma to…' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Who?' }), 'Ker')
    await userEvent.click(await within(dialog).findByRole('button', { name: /Kerem Yılmaz/ }))
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Partner' }))
    expect(within(dialog).getByRole('radio', { name: 'Friends' })).toBeChecked() // shared
    save(dialog)

    expect(await screen.findByText('Kerem Yılmaz connected to Emma')).toBeInTheDocument()
    expect(writes).toEqual([
      {
        method: 'POST',
        path: '/api/relationships',
        body: {
          type: 'partner',
          person_a_id: 'kerem',
          person_b_id: 'emma',
          parent_type: null,
          label: '',
          started_on: null,
          space_id: 's1',
        },
      },
    ])
  })

  it('adds someone new as a step-child', async () => {
    const writes = server()
    const section = await openConnections()

    await userEvent.click(within(section).getByRole('button', { name: 'Add' }))
    const dialog = await screen.findByRole('dialog', { name: 'Connect Emma to…' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Who?' }), 'Arda')
    await userEvent.click(
      await within(dialog).findByRole('button', { name: 'Create “Arda” as a new person' }),
    )
    save(dialog)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Pick how they're connected to Emma.",
    )

    await userEvent.click(within(dialog).getByRole('radio', { name: 'Child of Emma' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument() // picking clears it
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Step' }))
    expect(within(dialog).queryByRole('radio', { name: 'Friends' })).not.toBeInTheDocument()
    save(dialog)

    await waitFor(() => expect(writes).toHaveLength(2))
    expect(writes).toEqual([
      { method: 'POST', path: '/api/people', body: { name: 'Arda' } },
      {
        method: 'POST',
        path: '/api/relationships',
        body: {
          type: 'parent',
          person_a_id: 'emma',
          person_b_id: 'arda',
          parent_type: 'step',
          label: '',
          started_on: null,
          space_id: null,
        },
      },
    ])
  })

  it('changes what a link is, keeping who it connects', async () => {
    const writes = server()
    const section = await openConnections()

    await openMenu(section, 'Kerem Yılmaz')
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Change type' }))
    const dialog = await screen.findByRole('dialog', { name: 'Change how they’re connected' })
    expect(within(dialog).getByRole('radio', { name: /Partner/ })).toBeChecked()
    expect(within(dialog).getByLabelText(/Since/)).toHaveValue('2019-06-01')
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Parent of Emma' }))
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Adoptive' }))
    save(dialog)

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toEqual({
      method: 'PATCH',
      path: '/api/relationships/l1',
      body: {
        type: 'parent',
        person_a_id: 'kerem',
        person_b_id: 'emma',
        parent_type: 'adoptive',
        label: '',
        started_on: '2019-06-01',
      },
    })
  })

  it('ends a partnership, says who moves to Former, and can undo it', async () => {
    const writes = server()
    const section = await openConnections()

    await openMenu(section, 'Kerem Yılmaz')
    await userEvent.click(await screen.findByRole('menuitem', { name: 'End this relationship…' }))
    const dialog = await screen.findByRole('dialog', { name: "End Emma and Kerem's partnership" })
    expect(await within(dialog).findByText(/former parent-in-law/)).toBeInTheDocument()
    expect(within(dialog).getByRole('radio', { name: "Don't know" })).toBeChecked()
    save(dialog)

    expect(await screen.findByText("Emma and Kerem's partnership ended")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(writes).toHaveLength(2))
    expect(writes).toEqual([
      { method: 'POST', path: '/api/relationships/l1/end', body: { ended_on: null } },
      { method: 'POST', path: '/api/relationships/l1/reopen', body: null },
    ])
  })

  it('removes a link and puts it back on Undo', async () => {
    const writes = server()
    const section = await openConnections()

    await openMenu(section, 'Kerem Yılmaz')
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove the link' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))

    await waitFor(() => expect(writes).toHaveLength(2))
    expect(writes[0]).toEqual({ method: 'DELETE', path: '/api/relationships/l1', body: null })
    expect(writes[1]).toMatchObject({
      method: 'POST',
      path: '/api/relationships',
      body: {
        person_a_id: 'emma',
        person_b_id: 'kerem',
        type: 'partner',
        started_on: '2019-06-01',
      },
    })
  })

  it('offers no menu on derived family or on links someone else made', async () => {
    server()
    const section = await openConnections()
    await within(section).findByText('Nazlı Yılmaz')

    expect(within(section).getAllByRole('button', { name: /change or end/ })).toHaveLength(1)
  })
})

describe('connection kinds', () => {
  it('store each choice the way the type reads, and read it back', () => {
    expect(linkFor('child', 'emma', 'arda')).toEqual({
      type: 'parent',
      person_a_id: 'emma',
      person_b_id: 'arda',
    })
    expect(linkFor('niece_nephew', 'emma', 'can')).toMatchObject({
      type: 'aunt_uncle',
      person_a_id: 'emma',
    })

    const stored = link('x', ['emma', 'Emma'], ['arda', 'Arda'], 'grandparent')
    expect(kindOf(stored, 'emma')).toBe('grandchild') // on Emma's page, Arda is a grandchild
    expect(kindOf(stored, 'arda')).toBe('grandparent')
    expect(kindOf(link('y', ['a', 'A'], ['emma', 'Emma'], 'cousin'), 'emma')).toBe('cousin')
  })
})
