import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'

/** People who left your book because of someone else, until dismissed. Under ['people'],
 * so a change that ends someone's access refreshes it. */
export const accessEndedQuery = queryOptions({
  queryKey: ['people', 'access-ended'],
  queryFn: ({ signal }) => unwrap(api.GET('/api/today/access-ended', { signal })),
})

export async function dismissAccessEnded(queryClient: QueryClient, noticeId: string) {
  await unwrap(
    api.DELETE('/api/today/access-ended/{notice_id}', {
      params: { path: { notice_id: noticeId } },
    }),
  )
  await queryClient.invalidateQueries({ queryKey: accessEndedQuery.queryKey })
}
