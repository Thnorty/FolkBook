import createClient, { type Middleware } from 'openapi-fetch'
import { ApiError } from './errors'
import type { paths } from './schema'

const CSRF_COOKIE = 'csrftoken'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function readCookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}

/**
 * The token Django expects in X-CSRFToken. It's read from the cookie on every write
 * because logging in replaces it; the first write fetches it if there's none yet.
 */
async function csrfToken(origin: string): Promise<string> {
  const token = readCookie(CSRF_COOKIE)
  if (token) return token
  await fetch(`${origin}/api/auth/csrf`, { credentials: 'same-origin' }).catch(() => {
    throw new ApiError(0)
  })
  return readCookie(CSRF_COOKIE) ?? ''
}

const csrf = (origin: string): Middleware => ({
  async onRequest({ request }) {
    if (!SAFE_METHODS.has(request.method)) {
      request.headers.set('X-CSRFToken', await csrfToken(origin))
    }
    return request
  },
})

const errors: Middleware = {
  async onResponse({ response }) {
    if (!response.ok) throw await ApiError.fromResponse(response)
  },
  onError({ error }) {
    // Cancelled requests (e.g. a query that's no longer needed) aren't failures.
    if (error instanceof DOMException && error.name === 'AbortError') return
    return new ApiError(0)
  },
}

/** A typed client for the FolkBook API. Paths and bodies come from the generated schema. */
export function createApiClient(origin = window.location.origin) {
  const client = createClient<paths>({
    baseUrl: origin,
    credentials: 'same-origin',
    // Look fetch up on each call rather than once, so tests can replace it.
    fetch: (request) => fetch(request),
  })
  client.use(csrf(origin), errors)
  return client
}

export const api = createApiClient()

/**
 * The data of a successful call. Failed calls never get here: the client rejects
 * them with an ApiError. Endpoints that answer 204 resolve to undefined.
 */
export async function unwrap<T>(request: Promise<{ data?: T }>): Promise<T> {
  const { data } = await request
  return data as T
}
