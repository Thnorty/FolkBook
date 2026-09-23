import { queryOptions } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'

/** How many people are in your notebook, for the sidebar count. */
export const peopleCountQuery = queryOptions({
  queryKey: ['people', 'count'],
  queryFn: async ({ signal }) => {
    const page = await unwrap(
      api.GET('/api/people', { params: { query: { page_size: 1 } }, signal }),
    )
    return page.count
  },
})
