import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import type { components } from '@/api/schema'

export type Person = components['schemas']['PersonOut']

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

/** How many people are waiting for "how do you know them?". */
export const needsDetailsCountQuery = queryOptions({
  queryKey: ['people', 'count', 'needs-details'],
  queryFn: async ({ signal }) => {
    const page = await unwrap(
      api.GET('/api/people', {
        params: { query: { page_size: 1, needs_details: true } },
        signal,
      }),
    )
    return page.count
  },
})

export type PeopleFilters = { search?: string; space?: string; needsDetails?: boolean }

/** The People list, 50 at a time, filtered and searched on the server. */
export function peopleListQuery({ search = '', space, needsDetails = false }: PeopleFilters) {
  return infiniteQueryOptions({
    queryKey: ['people', 'list', { search, space, needsDetails }],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      unwrap(
        api.GET('/api/people', {
          params: {
            query: { page: pageParam, search, space: space ?? null, needs_details: needsDetails },
          },
          signal,
        }),
      ),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((total, page) => total + page.items.length, 0)
      return loaded < lastPage.count ? pages.length + 1 : undefined
    },
  })
}
