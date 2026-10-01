import { queryOptions } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'

/* Under ['people'], so adding someone or a link redraws the graph. */

/** Everyone you can see and how they're connected. */
export const graphQuery = queryOptions({
  queryKey: ['people', 'graph'],
  queryFn: ({ signal }) => unwrap(api.GET('/api/graph', { signal })),
})

/** Focus mode: a person and everyone one step away. */
export const neighborhoodQuery = (personId: string) =>
  queryOptions({
    queryKey: ['people', 'graph', 'focus', personId],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/graph/neighborhood/{person_id}', {
          params: { path: { person_id: personId }, query: { hops: 1 } },
          signal,
        }),
      ),
  })
