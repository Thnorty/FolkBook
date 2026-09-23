import { describe, expect, it } from 'vitest'
import { fakeServer, json } from '../test/fakeServer'
import { createApiClient, unwrap } from './client'
import { ApiError } from './errors'
import { createQueryClient, shouldRetry } from './query'
import { currentUserQuery } from './session'

const ME = { id: '1', email: 'ela@example.com', is_admin: false, me: null }

describe('shouldRetry', () => {
  it.each([
    ['an unreachable server', new ApiError(0), true],
    ['a server error', new ApiError(503), true],
    ['an unexpected error', new TypeError('oops'), true],
    ['a missing record', new ApiError(404), false],
    ['forbidden', new ApiError(403), false],
    ['invalid input', new ApiError(422), false],
    ['a logged-out session', new ApiError(401), false],
  ])('after %s: %s', (_, error, expected) => {
    expect(shouldRetry(0, error)).toBe(expected)
  })

  it('gives up after two retries', () => {
    expect(shouldRetry(1, new ApiError(503))).toBe(true)
    expect(shouldRetry(2, new ApiError(503))).toBe(false)
  })
})

describe('current user', () => {
  it('is the logged-in user', async () => {
    fakeServer({ 'GET /api/auth/me': () => json(ME) })

    await expect(createQueryClient().fetchQuery(currentUserQuery)).resolves.toEqual(ME)
  })

  it('is null when nobody is logged in', async () => {
    fakeServer({ 'GET /api/auth/me': () => json({ detail: 'Unauthorized' }, 401) })

    await expect(createQueryClient().fetchQuery(currentUserQuery)).resolves.toBeNull()
  })

  it('is cleared when any other call finds the session has ended', async () => {
    fakeServer({ 'GET /api/people': () => json({ detail: 'Unauthorized' }, 401) })
    const client = createQueryClient()
    client.setQueryData(currentUserQuery.queryKey, ME)

    await client
      .fetchQuery({
        queryKey: ['people'],
        queryFn: () => unwrap(createApiClient().GET('/api/people')),
      })
      .catch(() => undefined)

    expect(client.getQueryData(currentUserQuery.queryKey)).toBeNull()
  })

  it('is kept when a call fails for another reason', async () => {
    fakeServer({})
    const client = createQueryClient()
    client.setQueryData(currentUserQuery.queryKey, ME)

    await client
      .fetchQuery({ queryKey: ['people'], queryFn: () => Promise.reject(new ApiError(404)) })
      .catch(() => undefined)

    expect(client.getQueryData(currentUserQuery.queryKey)).toEqual(ME)
  })
})
