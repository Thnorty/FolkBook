import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { ApiError } from './errors'
import { currentUserQuery } from './session'

declare module '@tanstack/react-query' {
  interface Register {
    // The API client rejects every failed call with an ApiError.
    defaultError: ApiError
  }
}

const MAX_RETRIES = 2

/** Retry only what might work next time: network trouble and server errors, not 4xx. */
export function shouldRetry(failureCount: number, error: Error): boolean {
  const transient = !(error instanceof ApiError) || error.status === 0 || error.status >= 500
  return transient && failureCount < MAX_RETRIES
}

export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: forgetUserWhenLoggedOut }),
    mutationCache: new MutationCache({ onError: forgetUserWhenLoggedOut }),
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 30_000 },
    },
  })

  // A 401 anywhere means the session ended (expired, or signed out from another
  // device). Clearing the current user sends the app back to the login screen.
  function forgetUserWhenLoggedOut(error: Error) {
    if (error instanceof ApiError && error.status === 401) {
      client.setQueryData(currentUserQuery.queryKey, null)
    }
  }

  return client
}
