import { queryOptions } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'

/** The spaces you can see, by name (first page; enough until #44 adds more). */
export const spacesQuery = queryOptions({
  queryKey: ['spaces', 'list'],
  queryFn: ({ signal }) => unwrap(api.GET('/api/spaces', { signal })),
})
