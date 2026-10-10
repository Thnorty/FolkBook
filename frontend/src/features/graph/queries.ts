import { queryOptions } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'

/* Under ['people'], so adding someone or a link redraws the graph. */

/** Everyone you can see and how they're connected. */
export const graphQuery = queryOptions({
  queryKey: ['people', 'graph'],
  queryFn: ({ signal }) => unwrap(api.GET('/api/graph', { signal })),
})

/** "How do I know…?": the shortest route from your Me to someone, and up to two others. */
export const pathsQuery = (personId: string) =>
  queryOptions({
    queryKey: ['people', 'graph', 'paths', personId],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/graph/paths/{person_id}', {
          params: { path: { person_id: personId } },
          signal,
        }),
      ),
  })

/** Focus mode: a person and everyone one or two steps away. */
export const neighborhoodQuery = (personId: string, hops: 1 | 2) =>
  queryOptions({
    queryKey: ['people', 'graph', 'focus', personId, hops],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/graph/neighborhood/{person_id}', {
          params: { path: { person_id: personId }, query: { hops } },
          signal,
        }),
      ),
    // Going from 1 to 2 steps keeps the 1-step people drawn until the rest arrive,
    // instead of everyone flashing in between; never someone else's people.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[3] === personId ? previous : undefined,
  })
