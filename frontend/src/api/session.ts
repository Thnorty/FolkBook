import { queryOptions } from '@tanstack/react-query'
import { api, unwrap } from './client'
import { ApiError } from './errors'

/** The logged-in user, or null when nobody is logged in. */
export const currentUserQuery = queryOptions({
  queryKey: ['auth', 'me'],
  queryFn: async ({ signal }) => {
    try {
      return await unwrap(api.GET('/api/auth/me', { signal }))
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null
      throw error
    }
  },
})
