import { queryOptions } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'

/** Whose password a reset link is for, and until when (looking changes nothing). */
export const resetPreviewQuery = (token: string) =>
  queryOptions({
    queryKey: ['password-resets', token],
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/auth/password-resets/{token}', { params: { path: { token } }, signal })),
    retry: false, // a used or expired link stays that way
  })

/** Set a new password with a reset link. Signs out every device. */
export function resetPassword(token: string, password: string) {
  return unwrap(
    api.POST('/api/auth/password-resets/{token}', {
      params: { path: { token } },
      body: { password },
    }),
  )
}
