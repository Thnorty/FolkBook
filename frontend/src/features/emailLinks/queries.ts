import { queryOptions } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'

/** Whose reminder emails an unsubscribe link stops. Looking changes nothing. */
export const unsubscribeQuery = (token: string) =>
  queryOptions({
    queryKey: ['email-links', 'unsubscribe', token],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/email-links/unsubscribe/{token}', { params: { path: { token } }, signal }),
      ),
    retry: false, // a broken link stays broken
  })

export const unsubscribe = (token: string) =>
  unwrap(api.POST('/api/email-links/unsubscribe/{token}', { params: { path: { token } } }))

/** Who a "We talked" link is about. Looking changes nothing. */
export const talkedQuery = (token: string) =>
  queryOptions({
    queryKey: ['email-links', 'we-talked', token],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/email-links/we-talked/{token}', { params: { path: { token } }, signal }),
      ),
    retry: false,
  })

export const logTalked = (token: string) =>
  unwrap(api.POST('/api/email-links/we-talked/{token}', { params: { path: { token } } }))
