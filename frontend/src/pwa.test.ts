/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { token } from '@/test/tokens'

/* What makes FolkBook installable: the manifest, the icons and the service worker. */

const read = (path: string) => readFileSync(path, 'utf8')
const manifest = JSON.parse(read('public/manifest.webmanifest')) as {
  display: string
  start_url: string
  theme_color: string
  background_color: string
  icons: { src: string; sizes: string; purpose: string }[]
}
const page = new DOMParser().parseFromString(read('index.html'), 'text/html')

/** Width and height from a PNG's header. */
function pngSize(path: string): string {
  const bytes = readFileSync(path)
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`
}

describe('manifest', () => {
  it('opens as its own app at the start page', () => {
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')
  })

  it('lists icons that exist at the sizes it claims, including a maskable one', () => {
    for (const icon of manifest.icons) {
      expect(pngSize(`public${icon.src}`), icon.src).toBe(icon.sizes)
    }
    const sizes = manifest.icons.filter((icon) => icon.purpose === 'any').map((icon) => icon.sizes)
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']))
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true)
  })

  it('uses the paper color', () => {
    expect(manifest.theme_color).toBe(token('paper', 'light'))
    expect(manifest.background_color).toBe(token('paper', 'light'))
  })
})

describe('index.html', () => {
  it('links the manifest and every icon it names, and those files exist', () => {
    const links = [
      ...page.querySelectorAll<HTMLLinkElement>(
        'link[rel="manifest"], link[rel="icon"], link[rel="apple-touch-icon"]',
      ),
    ]
    expect(links).toHaveLength(4)
    for (const link of links) {
      const href = link.getAttribute('href')!
      expect(existsSync(`public${href}`), href).toBe(true)
    }
    expect(pngSize('public/icons/apple-touch-icon.png')).toBe('180x180')
  })

  it('colors the status bar with the paper, by day and at night', () => {
    for (const mode of ['light', 'dark'] as const) {
      const meta = page.querySelector(`meta[name="theme-color"][data-scheme="${mode}"]`)
      expect(meta?.getAttribute('content'), mode).toBe(token('paper', mode))
      expect(meta?.getAttribute('media')).toBe(`(prefers-color-scheme: ${mode})`)
    }
  })
})

describe('offline page', () => {
  it('uses the real token colors', () => {
    const page = read('public/offline.html')
    for (const name of ['paper', 'ink', 'ink-soft', 'accent', 'on-accent']) {
      expect(page, name).toContain(
        `--${name}: light-dark(${token(name, 'light')}, ${token(name, 'dark')})`,
      )
    }
  })
})

describe('service worker', () => {
  type Handler = (event: Record<string, unknown>) => void

  /** Runs public/sw.js against fake browser APIs and returns what it registered. */
  function loadWorker({ online }: { online: boolean }) {
    const handlers: Record<string, Handler> = {}
    const cache = { addAll: vi.fn(async () => {}) }
    const caches = {
      open: vi.fn(async () => cache),
      match: vi.fn(async (request: unknown) => `cached ${String(request)}`),
      keys: vi.fn(async () => ['folkbook-offline-v0', 'folkbook-offline-v1']),
      delete: vi.fn(async () => true),
    }
    const fetch = vi.fn(async () => {
      if (!online) throw new TypeError('offline')
      return 'from network'
    })
    const self = {
      addEventListener: (type: string, handler: Handler) => (handlers[type] = handler),
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn() },
    }
    new Function('self', 'caches', 'fetch', read('public/sw.js'))(self, caches, fetch)
    return { handlers, caches, cache, fetch }
  }

  async function fetchEvent(handlers: Record<string, Handler>, url: string, mode = 'cors') {
    let response: Promise<unknown> | undefined
    handlers.fetch({ request: { url, mode }, respondWith: (r: Promise<unknown>) => (response = r) })
    return response && (await response)
  }

  it('keeps the offline page ready and removes older caches', async () => {
    const { handlers, cache, caches } = loadWorker({ online: true })
    const waits: Promise<unknown>[] = []
    const waitUntil = (promise: Promise<unknown>) => waits.push(promise)

    handlers.install({ waitUntil })
    handlers.activate({ waitUntil })
    await Promise.all(waits)

    expect(cache.addAll).toHaveBeenCalledWith(['/offline.html', '/icons/icon.svg'])
    expect(caches.delete).toHaveBeenCalledWith('folkbook-offline-v0')
    expect(caches.delete).not.toHaveBeenCalledWith('folkbook-offline-v1')
  })

  it('shows the offline page when a page load fails, and the page itself when online', async () => {
    const offline = loadWorker({ online: false })
    expect(await fetchEvent(offline.handlers, 'https://folk.example/people', 'navigate')).toBe(
      'cached /offline.html',
    )

    const online = loadWorker({ online: true })
    expect(await fetchEvent(online.handlers, 'https://folk.example/people', 'navigate')).toBe(
      'from network',
    )
  })

  it('never caches the API or the app', async () => {
    const { handlers, caches } = loadWorker({ online: false })

    expect(await fetchEvent(handlers, 'https://folk.example/api/people')).toBeUndefined()
    expect(await fetchEvent(handlers, 'https://folk.example/assets/index.js')).toBeUndefined()
    expect(caches.match).not.toHaveBeenCalled()
  })
})
