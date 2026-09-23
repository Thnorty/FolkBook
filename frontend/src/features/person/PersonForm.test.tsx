import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

// jsdom can't load images or draw on a canvas: the cropper reports a fixed frame,
// and "cropping" returns a small blob.
vi.mock('react-easy-crop', () => ({
  default: function FakeCropper(props: { onCropComplete: (area: object, pixels: object) => void }) {
    // Like the real one, report the frame once rather than on every render.
    const [report] = useState(() => props.onCropComplete)
    useEffect(() => report({}, { x: 0, y: 0, width: 400, height: 500 }), [report])
    return <div data-testid="cropper" />
  },
}))
// Uploads are checked at the call: jsdom's FormData and Blob can't travel through the
// Node Request the fake server sees (browsers don't have that split).
const CROPPED = new Blob(['jpeg'], { type: 'image/jpeg' })
const uploads = vi.hoisted(() => [] as { personId: string; photo: Blob }[])
vi.mock('./photo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./photo')>()),
  cropToBlob: async () => CROPPED,
  uploadPhoto: async (personId: string, photo: Blob) => {
    uploads.push({ personId, photo })
    return { ...saved(), photo: { url: '/p', thumbnail_url: '/t', caption: 'Tom' } }
  },
}))

const ME = { id: 'u1', email: 'ela@example.com', is_admin: false, me: { id: 'me', name: 'Ela' } }
const space = (id: string, name: string, role: string) => ({
  id,
  name,
  color: 'sage',
  description: '',
  share_contact_details: false,
  role,
  owner: { id: 'me', name: 'Ela' },
  people_count: 0,
  member_count: 0,
})

const saved = (extra: Record<string, unknown> = {}) => ({
  id: 'tom',
  name: 'Tom Bergqvist',
  how_we_met: 'Hackathon in Berlin',
  work: '',
  birthday: null,
  tags: [],
  spaces: [],
  photo: null,
  is_me: false,
  is_mine: true,
  owner: { id: 'me', name: 'Ela' },
  needs_details: false,
  last_talked_on: null,
  contact_methods: [],
  can_edit: true,
  can_delete: true,
  ...extra,
})

type Write = { method: string; path: string; body: unknown }

function server(tom = saved()) {
  const writes: Write[] = []
  const record = async (request: Request, body: unknown) => {
    writes.push({ method: request.method, path: new URL(request.url).pathname, body })
  }
  fakeServer({
    'GET /api/auth/me': () => json(ME),
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/spaces': () =>
      json({
        items: [space('s1', 'Friends', 'owner'), space('s2', 'Hackathon', 'viewer')],
        count: 2,
      }),
    'GET /api/people': () => json({ items: [], count: 0 }),
    'GET /api/people/tom': () => json(tom),
    'POST /api/people': async (request) => {
      await record(request, await request.json())
      return json(saved(), 201)
    },
    'PATCH /api/people/tom': async (request) => {
      await record(request, await request.json())
      return json(tom)
    },
    'DELETE /api/people/tom/photo': async (request) => {
      await record(request, null)
      return json(saved())
    },
  })
  return writes
}

const dialog = (name: string | RegExp) => screen.findByRole('dialog', { name })

afterEach(clearCookies)

describe('adding someone', () => {
  it('saves what you typed and opens their page', async () => {
    const writes = server()
    const router = renderApp('/people')
    await userEvent.click(await screen.findByRole('button', { name: /Add person/ }))
    const form = await dialog('Add someone')

    await userEvent.type(within(form).getByLabelText('Name'), 'Tom Bergqvist')
    await userEvent.type(within(form).getByLabelText('How we met'), 'Hackathon in Berlin')
    await userEvent.click(within(form).getByRole('button', { name: 'Friends' }))
    await userEvent.click(within(form).getByRole('button', { name: /More details/ }))
    await userEvent.type(within(form).getByLabelText('Day'), '14')
    await userEvent.selectOptions(within(form).getByLabelText('Month'), '6')
    await userEvent.click(within(form).getByRole('button', { name: /Add a phone/ }))
    await userEvent.type(within(form).getByLabelText('Contact 1'), '+46 70 555 12 90')
    await userEvent.type(within(form).getByLabelText('Tags'), 'designer{Enter}climbing,')
    await userEvent.click(within(form).getByRole('button', { name: 'Save person' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/people/tom'))
    expect(writes).toEqual([
      {
        method: 'POST',
        path: '/api/people',
        body: {
          name: 'Tom Bergqvist',
          how_we_met: 'Hackathon in Berlin',
          work: '',
          birthday: { day: 14, month: 6, year: null },
          tags: ['designer', 'climbing'],
          contact_methods: [{ kind: 'phone', label: '', value: '+46 70 555 12 90' }],
          space_ids: ['s1'],
          photo_caption: '',
        },
      },
    ])
    expect(await screen.findByText('Tom Bergqvist added')).toBeInTheDocument()
  })

  it('only offers spaces you can add people to', async () => {
    server()
    renderApp('/people')
    await userEvent.click(await screen.findByRole('button', { name: /Add person/ }))
    const form = await dialog('Add someone')

    expect(within(form).getByRole('button', { name: 'Friends' })).toBeInTheDocument()
    expect(within(form).queryByRole('button', { name: 'Hackathon' })).not.toBeInTheDocument()
  })

  it('crops a photo and uploads it after saving the person', async () => {
    const writes = server()
    renderApp('/people')
    await userEvent.click(await screen.findByRole('button', { name: /Add person/ }))
    const form = await dialog('Add someone')
    await userEvent.type(within(form).getByLabelText('Name'), 'Tom Bergqvist')

    const file = new File(['raw'], 'IMG_2841.jpg', { type: 'image/jpeg' })
    await userEvent.upload(within(form).getByLabelText('Add photo'), file)
    await userEvent.click(await within(form).findByRole('button', { name: 'Use photo' }))
    // The name goes on the polaroid by default.
    expect(await within(form).findByLabelText('Written on the polaroid')).toHaveValue('Tom')
    await userEvent.click(within(form).getByRole('button', { name: 'Save person' }))

    await waitFor(() => expect(uploads).toEqual([{ personId: 'tom', photo: CROPPED }]))
    expect(writes[0]).toMatchObject({ path: '/api/people', body: { photo_caption: 'Tom' } })
  })

  it('saves with Ctrl+Enter and shows what went wrong', async () => {
    server()
    fakeServer({
      'GET /api/auth/me': () => json(ME),
      'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
      'GET /api/spaces': () => json({ items: [], count: 0 }),
      'GET /api/people': () => json({ items: [], count: 0 }),
      'POST /api/people': () =>
        json({ detail: [{ loc: ['body', 'name'], msg: 'That name is too long.' }] }, 422),
    })
    renderApp('/people')
    await userEvent.click(await screen.findByRole('button', { name: /Add person/ }))
    const form = await dialog('Add someone')
    await userEvent.type(within(form).getByLabelText('Name'), 'Tom')

    fireEvent.keyDown(within(form).getByLabelText('Name'), { key: 'Enter', ctrlKey: true })

    expect(await within(form).findByRole('alert')).toHaveTextContent('That name is too long.')
  })
})

describe('editing someone', () => {
  it('opens with what is saved and sends the changes', async () => {
    const writes = server(
      saved({ tags: ['designer'], birthday: { day: 14, month: 6, year: 1995 } }),
    )
    renderApp('/people/tom')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const form = await dialog('Edit Tom Bergqvist')
    expect(await within(form).findByLabelText('Name')).toHaveValue('Tom Bergqvist')

    const met = within(form).getByLabelText('How we met')
    await userEvent.clear(met)
    await userEvent.type(met, 'Berlin, March 2026')
    await userEvent.click(within(form).getByRole('button', { name: 'Save person' }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({
      method: 'PATCH',
      path: '/api/people/tom',
      body: {
        how_we_met: 'Berlin, March 2026',
        birthday: { day: 14, month: 6, year: 1995 },
        tags: ['designer'],
      },
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it("leaves tags and contact details out for someone you don't own", async () => {
    const writes = server(saved({ is_mine: false, owner: { id: 'defne', name: 'Defne' } }))
    renderApp('/people/tom')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const form = await dialog('Edit Tom Bergqvist')
    await userEvent.click(await within(form).findByRole('button', { name: /More details/ }))

    expect(within(form).queryByLabelText('Tags')).not.toBeInTheDocument()
    await userEvent.click(within(form).getByRole('button', { name: 'Save person' }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].body).not.toHaveProperty('tags')
    expect(writes[0].body).not.toHaveProperty('contact_methods')
  })

  it('removes the photo', async () => {
    const writes = server(saved({ photo: { url: '/p', thumbnail_url: '/t', caption: 'Tom' } }))
    renderApp('/people/tom')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const form = await dialog('Edit Tom Bergqvist')

    await userEvent.click(await within(form).findByRole('button', { name: 'Remove photo' }))
    await userEvent.click(within(form).getByRole('button', { name: 'Save person' }))

    await waitFor(() => expect(writes).toHaveLength(2))
    expect(writes[1]).toEqual({ method: 'DELETE', path: '/api/people/tom/photo', body: null })
  })
})
