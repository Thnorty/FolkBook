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

export function createSpace(input: SpaceInput) {
  return unwrap(api.POST('/api/spaces', { body: input }))
}

export function updateSpace(spaceId: string, changes: Partial<SpaceInput>) {
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
