import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

const user = (isAdmin: boolean) => ({
  id: 'u1',
  email: 'ela@example.com',
  is_admin: isAdmin,
  me: { id: 'me', name: 'Ela' },
})
const smtp = (extra = {}) => ({
  host: 'smtp.fastmail.com',
  port: 587,
  security: 'starttls',
  username: 'ela@fastmail.com',
  has_password: true,
  password_unreadable: false,
  from_address: 'FolkBook <folkbook@ela.home>',
  set_by: 'Ela',
  updated_at: '2026-10-16T09:00:00Z',
  ...extra,
})

type Settings = { source: 'environment' | 'saved' | null; smtp: ReturnType<typeof smtp> | null }
type Write = { method: string; path: string; body: unknown }

function server(settings: Settings, { admin = true, test = { ok: true, message: '' } } = {}) {
  const writes: Write[] = []
  const answer = () =>
    json({
      ...settings,
      ready: Boolean(settings.smtp),
      links_to: 'https://folk.ela.home',
      send_to: 'ela@example.com',
    })
  const record = async (request: Request) => {
    const body = request.method === 'DELETE' ? null : await request.json()
    writes.push({ method: request.method, path: new URL(request.url).pathname, body })
    return body as Record<string, unknown>
  }
  fakeServer({
    'GET /api/auth/me': () => json(user(admin)),
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/mail/status': () => json({ ready: Boolean(settings.smtp) }),
    'GET /api/mail': answer,
    'PUT /api/mail': async (request) => {
      const body = await record(request)
      settings.source = 'saved'
      settings.smtp = smtp({ ...body, has_password: Boolean(body.password ?? true) })
      return answer()
    },
    'DELETE /api/mail': async (request) => {
      await record(request)
      settings.source = null
      settings.smtp = null
      return answer()
    },
    'POST /api/mail/test': async (request) => {
      await record(request)
      return json(test)
    },
  })
  return writes
}

const form = () => screen.findByRole('form', { name: 'Email (SMTP)' })

afterEach(clearCookies)

describe('Settings → Email (SMTP)', () => {
  it('sets up email, and the banner goes away', async () => {
    const writes = server({ source: null, smtp: null })
    renderApp('/settings/email')

    expect(
      await screen.findByText(/Email isn't set up; reminders only show on Today/),
    ).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Settings' })
    expect(within(nav).getByRole('link', { name: 'Email (SMTP): not set up' })).toBeInTheDocument()
    await form()
    await userEvent.type(screen.getByLabelText('SMTP host'), 'smtp.fastmail.com')
    await userEvent.click(screen.getByRole('radio', { name: 'SSL / TLS' }))
    await userEvent.clear(screen.getByLabelText('Port'))
    await userEvent.type(screen.getByLabelText('Port'), '465')
    await userEvent.type(screen.getByLabelText('Username'), 'ela@fastmail.com')
    await userEvent.type(screen.getByLabelText('Password'), 'app-password')
    await userEvent.type(screen.getByLabelText('From'), 'FolkBook <folkbook@ela.home>')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByText(/Email isn't set up/)).not.toBeInTheDocument())
    expect(writes).toEqual([
      {
        method: 'PUT',
        path: '/api/mail',
        body: {
          host: 'smtp.fastmail.com',
          port: 465,
          security: 'ssl',
          username: 'ela@fastmail.com',
          from_address: 'FolkBook <folkbook@ela.home>',
          password: 'app-password',
        },
      },
    ])
    expect(within(nav).getByRole('link', { name: 'Email (SMTP)' })).toBeInTheDocument()
    expect(screen.getByText('Saved')).toBeVisible() // the password: never shown, not even a part
  })

  it('keeps the saved password, but asks for it again for another server', async () => {
    const writes = server({ source: 'saved', smtp: smtp() })
    renderApp('/settings/email')

    await form()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].body).not.toHaveProperty('password')

    await userEvent.clear(screen.getByLabelText('SMTP host'))
    await userEvent.type(screen.getByLabelText('SMTP host'), 'smtp.elsewhere.example')

    expect(screen.getByLabelText('Password')).toHaveValue('')
  })

  it('sends a test email through the form, saved or not', async () => {
    const writes = server(
      { source: null, smtp: null },
      { test: { ok: true, message: 'Sent to ela@example.com' } },
    )
    renderApp('/settings/email')

    await form()
    expect(screen.getByText('Goes to ela@example.com')).toBeVisible()
    await userEvent.type(screen.getByLabelText('SMTP host'), 'smtp.fastmail.com')
    await userEvent.type(screen.getByLabelText('From'), 'folkbook@ela.home')
    await userEvent.click(screen.getByRole('button', { name: 'Send test email' }))

    expect(await screen.findByText(/✓ Sent to ela@example.com · /)).toBeVisible()
    expect(writes).toEqual([
      {
        method: 'POST',
        path: '/api/mail/test',
        body: {
          smtp: {
            host: 'smtp.fastmail.com',
            port: 587,
            security: 'starttls',
            username: '',
            from_address: 'folkbook@ela.home',
            password: '',
          },
        },
      },
    ])
  })

  it('checks the fields before testing, and says why a test failed', async () => {
    const writes = server(
      { source: 'saved', smtp: smtp() },
      { test: { ok: false, message: 'The server refused the username or password.' } },
    )
    renderApp('/settings/email')

    await form()
    await userEvent.clear(screen.getByLabelText('From'))
    await userEvent.click(screen.getByRole('button', { name: 'Send test email' }))
    expect(writes).toEqual([])

    await userEvent.type(screen.getByLabelText('From'), 'folkbook@ela.home')
    await userEvent.click(screen.getByRole('button', { name: 'Send test email' }))
    expect(await screen.findByText('The server refused the username or password.')).toBeVisible()
  })

  it('shows settings from the environment without a form', async () => {
    const writes = server({ source: 'environment', smtp: smtp({ set_by: null }) })
    renderApp('/settings/email')

    expect(await screen.findByText(/Set in the server's environment/)).toBeVisible()
    expect(screen.getByText('smtp.fastmail.com:587')).toBeVisible()
    expect(screen.queryByRole('form', { name: 'Email (SMTP)' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Send test email' }))

    await waitFor(() =>
      expect(writes).toEqual([{ method: 'POST', path: '/api/mail/test', body: { smtp: null } }]),
    )
  })

  it('removes the settings after asking', async () => {
    const writes = server({ source: 'saved', smtp: smtp() })
    renderApp('/settings/email')

    await form()
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove email' }))

    expect(await screen.findByText(/Email isn't set up/)).toBeVisible()
    expect(writes).toEqual([{ method: 'DELETE', path: '/api/mail', body: null }])
    expect(screen.getByLabelText('SMTP host')).toHaveValue('')
  })

  it('is for admins only, and members never see the banner', async () => {
    server({ source: null, smtp: null }, { admin: false })
    const router = renderApp('/settings/email')

    await waitFor(() => expect(router.state.location.pathname).toBe('/settings'))
    const nav = await screen.findByRole('navigation', { name: 'Settings' })
    expect(within(nav).queryByRole('link', { name: /Email/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Email isn't set up/)).not.toBeInTheDocument()
  })
})
