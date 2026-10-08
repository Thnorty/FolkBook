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

/**
 * Forget everything cached except who is logged in, so one account never sees another's
 * data, and a restored book shows none of the one it replaced.
 */
export function forgetOtherData(queryClient: QueryClient) {
  queryClient.removeQueries({
    predicate: (query) => query.queryKey.join() !== currentUserQuery.queryKey.join(),
  })
}

/** Start using `user`'s session: nothing cached from before carries over. */
function start(queryClient: QueryClient, user: CurrentUser): CurrentUser {
  forgetOtherData(queryClient)
  queryClient.setQueryData(currentUserQuery.queryKey, user)
  return user
}

export async function logIn(
  queryClient: QueryClient,
  credentials: components['schemas']['LoginIn'],
): Promise<CurrentUser> {
  return start(queryClient, await unwrap(api.POST('/api/auth/login', { body: credentials })))
}

type SignUp = components['schemas']['SignUpIn']

/** Whether this server still needs its first account. */
export const setupStatusQuery = queryOptions({
  queryKey: ['auth', 'setup'],
  queryFn: ({ signal }) => unwrap(api.GET('/api/setup', { signal })),
})

/** Create the server's first account (its admin) and log in with it. */
export async function setUpServer(queryClient: QueryClient, account: SignUp) {
  const user = start(queryClient, await unwrap(api.POST('/api/setup', { body: account })))
  queryClient.setQueryData(setupStatusQuery.queryKey, { needed: false })
  return user
}

/** Sign up with an invite link and log in with the new account. */
export async function acceptInvite(queryClient: QueryClient, token: string, account: SignUp) {
  return start(
    queryClient,
    await unwrap(
      api.POST('/api/invites/by-token/{token}/accept', {
        params: { path: { token } },
        body: account,
      }),
    ),
  )
}

export async function logOut(queryClient: QueryClient) {
  await api.POST('/api/auth/logout')
  queryClient.setQueryData(currentUserQuery.queryKey, null)
  forgetOtherData(queryClient)
}
