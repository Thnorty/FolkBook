import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import type { components } from '@/api/schema'

export type CalendarFeed = components['schemas']['CalendarFeedOut']
export type CreatedCalendarFeed = components['schemas']['CreatedCalendarFeedOut']
export type CalendarFeedIn = components['schemas']['CalendarFeedIn']

/** Your calendar links, newest first. Never the links themselves, only their last five. */
export const calendarFeedsQuery = queryOptions({
  queryKey: ['calendars'],
  queryFn: async ({ signal }) => (await unwrap(api.GET('/api/calendars', { signal }))).items,
})

/** Make a link. The answer holds the whole URL, so it never goes into the cache. */
export async function createCalendarFeed(queryClient: QueryClient, body: CalendarFeedIn) {
  const created = await unwrap(api.POST('/api/calendars', { body }))
  await queryClient.invalidateQueries({ queryKey: calendarFeedsQuery.queryKey })
  return created
}

/** Revoke a link: calendars using it stop updating. */
export async function revokeCalendarFeed(queryClient: QueryClient, feedId: string) {
  await unwrap(api.DELETE('/api/calendars/{feed_id}', { params: { path: { feed_id: feedId } } }))
  await queryClient.invalidateQueries({ queryKey: calendarFeedsQuery.queryKey })
}
