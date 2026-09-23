import { vi } from 'vitest'

type Route = (request: Request) => Response | Promise<Response>

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Replaces fetch with a fake server. Routes are keyed "METHOD /path"; anything
 * else answers 404. Returns the requests it received, in order.
 */
export function fakeServer(routes: Record<string, Route>): Request[] {
  const received: Request[] = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    received.push(request)
    const route = routes[`${request.method} ${new URL(request.url).pathname}`]
    return route ? route(request) : json({ detail: 'Not Found' }, 404)
  })
  return received
}

export function clearCookies() {
  for (const cookie of document.cookie.split('; ').filter(Boolean)) {
    document.cookie = `${cookie.split('=')[0]}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`
  }
}
