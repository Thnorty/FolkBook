import { queryOptions } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'

/** The people list's page size. */
export const PAGE_SIZE = 50

/**
 * Who still needs details (an import's people, or everyone), read once when the mode
 * opens: its key isn't under "people", so saving someone doesn't refetch it and they
 * stay in the list, marked done.
 */
export const fillInQueueQuery = (importId?: string, page = 1) =>
  queryOptions({
    queryKey: ['fill-in', importId ?? 'all', page],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/people', {
          // Only your own people: "how do you know them" is yours to answer.
          params: { query: { needs_details: true, mine: true, import: importId, page } },
          signal,
        }),
      ),
    staleTime: Infinity,
    gcTime: 0,
  })
