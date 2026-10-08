import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/api/client'
import { createQueryClient } from '@/api/query'
import { currentUserQuery } from '@/api/session'
import { fakeServer, json } from '@/test/fakeServer'
import { restoreBook } from './queries'

const ME = { id: 'u1', email: 'ela@example.com', is_admin: false, me: null }
const RESTORED = {
  name: 'Ela',
  email: 'ela@old.example.com',
  exported_at: '2026-10-03T09:00:00Z',
  people: 42,
  spaces: 3,
  photos: 12,
}

afterEach(() => vi.restoreAllMocks())

describe('restoring a book', () => {
  it('uploads the file and your email as a form, then forgets the old book', async () => {
    fakeServer({ 'GET /api/auth/me': () => json(ME) })
    // jsdom's files can't go into a real request, so look at the form it would send.
    const post = vi.spyOn(api, 'POST').mockResolvedValue({ data: RESTORED } as never)
    const queryClient = createQueryClient()
    queryClient.setQueryData(currentUserQuery.queryKey, ME)
    queryClient.setQueryData(['people', 'p1'], { name: 'Old friend' })
    const file = new File(['zip'], 'folkbook.zip', { type: 'application/zip' })

    await expect(restoreBook(queryClient, file, 'ela@example.com')).resolves.toEqual(RESTORED)

    const [path, options] = post.mock.calls[0] as [string, { bodySerializer: () => FormData }]
    expect(path).toBe('/api/export/restore')
    const form = options.bodySerializer()
    expect(form.get('file')).toBe(file)
    expect(form.get('confirm_email')).toBe('ela@example.com')
    expect(queryClient.getQueryData(['people', 'p1'])).toBeUndefined()
    expect(queryClient.getQueryData(currentUserQuery.queryKey)).toEqual(ME)
  })
})
