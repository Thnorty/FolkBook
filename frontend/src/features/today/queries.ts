import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import type { components } from '@/api/schema'

/*
 * What Today shows. `today` is the device's own date, so "today" follows the user's
 * time zone. Keys start with ['people'], so logging, snoozing or adding someone
 * refreshes Today too.
 */

export type Nudge = components['schemas']['NudgeOut']
export type Birthday = components['schemas']['BirthdayOut']

export const birthdaysQuery = (today: string) =>
  queryOptions({
    queryKey: ['people', 'birthdays', today],
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/today/birthdays', { params: { query: { today } }, signal })),
  })

export const dueQuery = (today: string) =>
  queryOptions({
    queryKey: ['people', 'due', today],
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/keep-in-touch/due', { params: { query: { today } }, signal })),
  })

/** A memory aid at random; `skip` the one on screen to get another. */
export const rememberQuery = (skip: string | null) =>
  queryOptions({
    // Not under ['people']: saving something elsewhere shouldn't swap the one on screen.
    queryKey: ['remember', skip],
    // No memory aids yet: 204, nothing to show.
    queryFn: async ({ signal }) =>
      (await unwrap(api.GET('/api/today/remember', { params: { query: { skip } }, signal }))) ??
      null,
    staleTime: Infinity, // a new one only when asked, not on every visit
    placeholderData: keepPreviousData, // keep the note up while the next one comes
  })

/** People nobody wrote "how you know them" for: the first few, and how many. */
export const blanksQuery = queryOptions({
  queryKey: ['people', 'list', 'blanks'],
  queryFn: ({ signal }) =>
    unwrap(
      api.GET('/api/people', { params: { query: { needs_details: true, page_size: 3 } }, signal }),
    ),
})

export const recentQuery = queryOptions({
  queryKey: ['people', 'list', 'recent'],
  queryFn: ({ signal }) =>
    unwrap(api.GET('/api/people', { params: { query: { recent: true, page_size: 5 } }, signal })),
})
