import { afterEach, describe, expect, it } from 'vitest'
import { clearCookies, fakeServer, json } from '../test/fakeServer'
import { createApiClient, unwrap } from './client'
import { ApiError } from './errors'

const ME = { id: '1', email: 'ela@example.com', is_admin: false }

function setCsrfCookie(token: string) {
  document.cookie = `csrftoken=${token}`
}

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

afterEach(clearCookies)

describe('CSRF', () => {
  it("doesn't send a token on reads", async () => {
    setCsrfCookie('abc')
    const requests = fakeServer({ 'GET /api/auth/me': () => json(ME) })

    await createApiClient().GET('/api/auth/me')

    expect(requests[0].headers.get('X-CSRFToken')).toBeNull()
  })

  it('sends the cookie as X-CSRFToken on writes', async () => {
    setCsrfCookie('abc')
    const requests = fakeServer({
      'POST /api/auth/logout': () => new Response(null, { status: 204 }),
    })

    await createApiClient().POST('/api/auth/logout')

    expect(requests.map((r) => r.url)).toEqual([`${location.origin}/api/auth/logout`])
    expect(requests[0].headers.get('X-CSRFToken')).toBe('abc')
  })

  it('fetches a token first when there is no cookie yet', async () => {
    const requests = fakeServer({
      'GET /api/auth/csrf': () => {
        setCsrfCookie('fresh')
        return new Response(null, { status: 204 })
      },
      'POST /api/auth/login': () => json(ME),
    })

    await createApiClient().POST('/api/auth/login', {
      body: { email: 'ela@example.com', password: 'secret123', remember: true },
    })

    expect(requests.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
      'GET /api/auth/csrf',
      'POST /api/auth/login',
    ])
    expect(requests[1].headers.get('X-CSRFToken')).toBe('fresh')
  })

  it('reads the cookie again on every write, since logging in replaces it', async () => {
    setCsrfCookie('before-login')
    const requests = fakeServer({
      'POST /api/auth/login': () => {
        setCsrfCookie('after-login')
        return json(ME)
      },
      'POST /api/auth/logout': () => new Response(null, { status: 204 }),
    })
    const client = createApiClient()

    await client.POST('/api/auth/login', {
      body: { email: 'ela@example.com', password: 'secret123', remember: true },
    })
    await client.POST('/api/auth/logout')

    expect(requests.map((r) => r.headers.get('X-CSRFToken'))).toEqual([
      'before-login',
      'after-login',
    ])
  })
})

describe('errors', () => {
  it('rejects with the status and the message from the API', async () => {
    fakeServer({ 'GET /api/auth/me': () => json({ detail: 'Unauthorized' }, 401) })

    const error = await rejection(createApiClient().GET('/api/auth/me'))

    expect(error.status).toBe(401)
    expect(error.message).toBe('Unauthorized')
  })

  it('joins the problems of invalid input into one message and keeps the list', async () => {
    setCsrfCookie('abc')
    const issues = [
      { loc: ['body', 'new_password'], msg: 'This password is too short.' },
      { loc: ['body', 'new_password'], msg: 'This password is too common.' },
    ]
    fakeServer({ 'POST /api/auth/password': () => json({ detail: issues }, 422) })

    const error = await rejection(
      createApiClient().POST('/api/auth/password', {
        body: { current_password: 'old', new_password: 'abc' },
      }),
    )

    expect(error.status).toBe(422)
    expect(error.detail).toEqual(issues)
    expect(error.message).toBe('This password is too short. This password is too common.')
  })

  it('falls back to a readable message when the body has no detail', async () => {
    fakeServer({ 'GET /api/auth/me': () => new Response('<h1>Bad Gateway</h1>', { status: 502 }) })

    const error = await rejection(createApiClient().GET('/api/auth/me'))

    expect(error.status).toBe(502)
    expect(error.message).toBe('Something went wrong. Try again in a moment.')
  })

  it('reports an unreachable server as status 0', async () => {
    fakeServer({
      'GET /api/auth/me': () => {
        throw new TypeError('Failed to fetch')
      },
    })

    const error = await rejection(createApiClient().GET('/api/auth/me'))

    expect(error.status).toBe(0)
    expect(error.message).toMatch(/can't reach the server/i)
  })
})

describe('unwrap', () => {
  it('resolves to the response data', async () => {
    fakeServer({ 'GET /api/auth/me': () => json(ME) })

    await expect(unwrap(createApiClient().GET('/api/auth/me'))).resolves.toEqual(ME)
  })
})
