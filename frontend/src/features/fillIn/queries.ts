import { queryOptions } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'

/**
 * Who still needs details (an import's people, or everyone), read once when the mode
 * opens: its key isn't under "people", so saving someone doesn't refetch it and they
 * stay in the list, marked done.
 */
export const fillInQueueQuery = (importId?: string) =>
  queryOptions({
    queryKey: ['fill-in', importId ?? 'all'],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/people', {
          params: { query: { needs_details: true, import: importId } },
          signal,
        }),
      ),
    staleTime: Infinity,
    gcTime: 0,
  })
