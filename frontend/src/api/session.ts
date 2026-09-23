import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { api, unwrap } from './client'
import { ApiError } from './errors'
import type { components } from './schema'

export type CurrentUser = components['schemas']['CurrentUserOut']

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

/** Forget everything cached except who is logged in, so one account never sees another's data. */
function forgetOtherData(queryClient: QueryClient) {
  queryClient.removeQueries({
    predicate: (query) => query.queryKey.join() !== currentUserQuery.queryKey.join(),
  })
}

export async function logIn(
  queryClient: QueryClient,
  credentials: components['schemas']['LoginIn'],
): Promise<CurrentUser> {
  const user = await unwrap(api.POST('/api/auth/login', { body: credentials }))
  forgetOtherData(queryClient)
  queryClient.setQueryData(currentUserQuery.queryKey, user)
  return user
}

export async function logOut(queryClient: QueryClient) {
  await api.POST('/api/auth/logout')
  queryClient.setQueryData(currentUserQuery.queryKey, null)
  forgetOtherData(queryClient)
}
