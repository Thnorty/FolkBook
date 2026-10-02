import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import type { components } from '@/api/schema'

export type Space = components['schemas']['SpaceOut']
export type SpaceInput = components['schemas']['SpaceIn']

/** The spaces you can see, by name (first page; enough until #44 adds more). */
export const spacesQuery = queryOptions({
  queryKey: ['spaces', 'list'],
  queryFn: ({ signal }) => unwrap(api.GET('/api/spaces', { signal })),
})

export const spaceQuery = (spaceId: string) =>
  queryOptions({
    queryKey: ['spaces', spaceId],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/spaces/{space_id}', { params: { path: { space_id: spaceId } }, signal }),
      ),
  })

const path = (spaceId: string) => ({ params: { path: { space_id: spaceId } } })

/** People in the space that you took out of your book, to add back. Under ['people'], so
 * taking someone out or adding them back refreshes it. */
export const hiddenPeopleQuery = (spaceId: string) =>
  queryOptions({
    queryKey: ['people', 'hidden', spaceId],
    queryFn: async ({ signal }) => {
      const page = await unwrap(
        api.GET('/api/spaces/{space_id}/hidden-people', { ...path(spaceId), signal }),
      )
      return page.items
    },
  })

export type Member = components['schemas']['MemberOut']
export type Role = components['schemas']['RoleIn']['role']

/** Who can see a space: the owner first, then members and their roles. */
export const membersQuery = (spaceId: string) =>
  queryOptions({
    queryKey: ['spaces', spaceId, 'members'],
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/spaces/{space_id}/members', { ...path(spaceId), signal })),
  })

/** Accounts on this server to share with (owner only; at least two letters). */
export const shareCandidatesQuery = (spaceId: string, q: string) =>
  queryOptions({
    queryKey: ['spaces', spaceId, 'candidates', q],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/spaces/{space_id}/share-candidates', {
          params: { path: { space_id: spaceId }, query: { q } },
          signal,
        }),
      ),
    enabled: q.length >= 2,
  })

export function shareSpace(spaceId: string, userId: string, role: Role) {
  return unwrap(
    api.POST('/api/spaces/{space_id}/members', {
      ...path(spaceId),
      body: { user_id: userId, role },
    }),
  )
}

export function changeRole(spaceId: string, userId: string, role: Role) {
  return unwrap(
    api.PATCH('/api/spaces/{space_id}/members/{user_id}', {
      params: { path: { space_id: spaceId, user_id: userId } },
      body: { role },
    }),
  )
}

export function removeMember(spaceId: string, userId: string) {
  return unwrap(
    api.DELETE('/api/spaces/{space_id}/members/{user_id}', {
      params: { path: { space_id: spaceId, user_id: userId } },
    }),
  )
}

/** Remove every member: the space is the owner's alone again. */
export function stopSharing(spaceId: string) {
  return unwrap(api.POST('/api/spaces/{space_id}/stop-sharing', path(spaceId)))
}

/** What leaving would do: who you'd keep a copy of, and how many others would go. */
export const leavePreviewQuery = (spaceId: string) =>
  queryOptions({
    queryKey: ['spaces', spaceId, 'leave-preview'],
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/spaces/{space_id}/leave-preview', { ...path(spaceId), signal })),
    staleTime: 0,
  })

/** Leave a space shared with you; returns the copies you kept. */
export function leaveSpace(spaceId: string) {
  return unwrap(api.POST('/api/spaces/{space_id}/leave', path(spaceId)))
}

export function createSpace(input: SpaceInput) {
  return unwrap(api.POST('/api/spaces', { body: input }))
}

export function updateSpace(spaceId: string, changes: components['schemas']['SpacePatch']) {
  return unwrap(api.PATCH('/api/spaces/{space_id}', { ...path(spaceId), body: changes }))
}

export function deleteSpace(spaceId: string) {
  return unwrap(api.DELETE('/api/spaces/{space_id}', path(spaceId)))
}

/** After a space changes: the spaces, and people (whose cards show their spaces). */
export async function refreshSpaces(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['spaces'] }),
    queryClient.invalidateQueries({ queryKey: ['people'] }),
  ])
}
