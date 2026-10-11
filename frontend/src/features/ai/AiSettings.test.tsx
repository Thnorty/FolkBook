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
const LOCAL_SERVER = provider({
  provider: 'openai_compatible',
  base_url: 'http://ollama:11434/v1',
  model: 'llama3.1:8b',
  key_hint: null,
  set_by: 'Ela',
})

type Settings = {
  mine: ReturnType<typeof provider> | null
  server: ReturnType<typeof provider> | null
}
type Write = { method: string; path: string; body: unknown }

function server(settings: Settings, { admin = false } = {}) {
  const writes: Write[] = []
  const answer = () =>
    json({
      ...settings,
      using: settings.mine ? 'mine' : settings.server ? 'server' : null,
      can_manage_server: admin,
    })
  const record = async (request: Request) => {
    const body = request.method === 'DELETE' ? null : await request.json()
    writes.push({ method: request.method, path: new URL(request.url).pathname, body })
    return body as Record<string, unknown>
  }
  fakeServer({
    'GET /api/auth/me': () => json(user(admin)),
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/ai': answer,
    'PUT /api/ai/mine': async (request) => {
      const body = await record(request)
      settings.mine = provider({ ...body, key_hint: 'ocal' })
      return answer()
    },
    'DELETE /api/ai/mine': async (request) => {
      await record(request)
      settings.mine = null
      return answer()
    },
    'PUT /api/ai/server': async (request) => {
      const body = await record(request)
      settings.server = provider({ ...body, set_by: 'Ela' })
      return answer()
    },
    'POST /api/ai/models': async (request) => {
      await record(request)
      return json({ models: ['gemini-2.5-flash', 'gemini-2.5-pro'], message: null })
    },
    'POST /api/ai/test': async (request) => {
      await record(request)
      return json({
        ok: true,
        message: 'Connected · gemini-2.5-flash answered in 640 ms',
        millis: 640,
      })
    },
  })
  return writes
}

// The page, once its settings have loaded (the first form shows then).
const page = async () => {
  await screen.findByRole('form', { name: 'Only for you' })
  return screen.getByRole('region', { name: 'AI' })
}
const card = (name: string) => screen.findByRole('form', { name })

afterEach(clearCookies)

describe('Settings → AI', () => {
  it('says which AI Quick capture uses', async () => {
    server({ mine: provider(), server: null })
    renderApp('/settings/ai')
    expect(await page()).toHaveTextContent(
      'Quick capture uses your own key · Gemini · gemini-2.5-flash',
    )
    expect(within(await card('Only for you')).getByText('•••• 3f9a')).toBeInTheDocument()
  })

  it('says when Quick capture uses the server’s AI, which a member only reads', async () => {
    server({ mine: null, server: LOCAL_SERVER })
    renderApp('/settings/ai')
    const settings = await page()
    expect(settings).toHaveTextContent(
      "Quick capture uses the server's AI, set up by Ela · OpenAI-compatible · llama3.1:8b",
    )
    expect(settings).toHaveTextContent(
      "The server's AI: OpenAI-compatible · llama3.1:8b, set up by Ela.",
    )
    expect(screen.queryByRole('form', { name: 'For everyone on this server' })).toBeNull()
  })

  it('says when AI is off', async () => {
    server({ mine: null, server: null })
    renderApp('/settings/ai')
    const settings = await page()
    expect(settings).toHaveTextContent('AI is off: Quick capture needs a key.')
    expect(settings).toHaveTextContent(
      'No server AI. Your admin can add one, or add your own key above.',
    )
  })

  it('saves your own key', async () => {
    const writes = server({ mine: null, server: null })
    renderApp('/settings/ai')
    const mine = await card('Only for you')

    await userEvent.click(within(mine).getByRole('radio', { name: /OpenAI-compatible/ }))
    await userEvent.type(within(mine).getByLabelText('Base URL'), 'http://ollama:11434/v1')
    await userEvent.type(within(mine).getByLabelText('API key'), 'sk-local')
    await userEvent.type(within(mine).getByLabelText('Model'), 'llama3.1:8b')
    await userEvent.click(within(mine).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(writes).toContainEqual({
        method: 'PUT',
        path: '/api/ai/mine',
        body: {
          provider: 'openai_compatible',
          base_url: 'http://ollama:11434/v1',
          model: 'llama3.1:8b',
          key: 'sk-local',
        },
      }),
    )
  })

  it('keeps the saved key unless you replace it', async () => {
    const writes = server({ mine: provider(), server: null })
    renderApp('/settings/ai')
    const mine = await card('Only for you')

    const model = within(mine).getByLabelText('Model')
    await userEvent.clear(model)
    await userEvent.type(model, 'gemini-2.5-pro')
    await userEvent.click(within(mine).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].body).not.toHaveProperty('key')

    await userEvent.click(within(mine).getByRole('button', { name: 'Replace' }))
    await userEvent.type(within(mine).getByLabelText('API key'), 'AIza-new')
    await userEvent.click(within(mine).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(writes).toHaveLength(2))
    expect(writes[1].body).toMatchObject({ key: 'AIza-new' })
  })

  it('fetches models and tests the connection', async () => {
    const writes = server({ mine: provider(), server: null })
    renderApp('/settings/ai')
    const mine = await card('Only for you')

    await userEvent.click(within(mine).getByRole('button', { name: 'Fetch models' }))
    await waitFor(() =>
      expect(
        [...document.querySelectorAll('#ai-mine-models option')].map((o) =>
          o.getAttribute('value'),
        ),
      ).toEqual(['gemini-2.5-flash', 'gemini-2.5-pro']),
    )
    await userEvent.click(within(mine).getByRole('button', { name: 'Test connection' }))
    expect(
      await within(mine).findByText('Connected · gemini-2.5-flash answered in 640 ms'),
    ).toBeInTheDocument()
    expect(writes.map((write) => write.body)).toEqual([
      expect.objectContaining({ saved: 'mine' }),
      expect.objectContaining({ saved: 'mine', model: 'gemini-2.5-flash' }),
    ])
  })

  it('lets an admin set the server AI', async () => {
    const writes = server({ mine: null, server: null }, { admin: true })
    renderApp('/settings/ai')
    const everyone = await card('For everyone on this server')
    expect(everyone).toHaveTextContent(
      "Everyone on this server who hasn't added their own key uses this. Their Quick capture text goes to this provider.",
    )

    await userEvent.type(within(everyone).getByLabelText('API key'), 'AIza-server')
    await userEvent.type(within(everyone).getByLabelText('Model'), 'gemini-2.5-flash')
    await userEvent.click(within(everyone).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(writes).toContainEqual({
        method: 'PUT',
        path: '/api/ai/server',
        body: { provider: 'gemini', base_url: '', model: 'gemini-2.5-flash', key: 'AIza-server' },
      }),
    )
  })

  it('removes your key after asking', async () => {
    const writes = server({ mine: provider(), server: LOCAL_SERVER })
    renderApp('/settings/ai')
    const mine = await card('Only for you')

    await userEvent.click(within(mine).getByRole('button', { name: 'Remove' }))
    expect(
      within(mine).getByText("Remove your key? Quick capture will use the server's AI."),
    ).toBeInTheDocument()
    await userEvent.click(within(mine).getByRole('button', { name: 'Remove key' }))

    await waitFor(() =>
      expect(writes).toContainEqual({ method: 'DELETE', path: '/api/ai/mine', body: null }),
    )
  })

  it('keeps the browser from filling in your login password as the key', async () => {
    server({ mine: null, server: null })
    renderApp('/settings/ai')
    const mine = await card('Only for you')

    expect(within(mine).getByLabelText('API key')).toHaveAttribute('autocomplete', 'new-password')
  })

  it('asks again for a key it cannot read', async () => {
    server({ mine: provider({ key_hint: null, key_unreadable: true }), server: null })
    renderApp('/settings/ai')
    const mine = await card('Only for you')

    expect(
      within(mine).getByText(
        "This key can't be read anymore (the server's secret changed). Enter it again.",
      ),
    ).toBeInTheDocument()
    expect(within(mine).getByLabelText('API key')).toBeInTheDocument()
  })
})
