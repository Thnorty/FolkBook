import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import type { components } from '@/api/schema'

export type SearchResults = components['schemas']['SearchOut']

/** People, spaces, your memory aids and notes matching `q`, among what you can see. */
export const searchQuery = (q: string) =>
  queryOptions({
    // Under ['people']: adding or changing someone refreshes what a search finds.
    queryKey: ['people', 'search', q],
    queryFn: ({ signal }) => unwrap(api.GET('/api/search', { params: { query: { q } }, signal })),
    placeholderData: keepPreviousData, // keep the last results up while typing
  })
