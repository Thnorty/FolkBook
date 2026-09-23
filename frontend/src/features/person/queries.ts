import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import type { components } from '@/api/schema'

/*
 * Everything the profile shows. Keys start with ['people', id], so saving anything
 * about a person can refresh all of it together (and the People list, under ['people']).
 */

export type PersonDetail = components['schemas']['PersonDetailOut']
export type MemoryAid = components['schemas']['MemoryAidOut']
export type Interaction = components['schemas']['InteractionOut']
export type Relationship = components['schemas']['RelationshipOut']
export type FamilyRelation = components['schemas']['FamilyRelationOut']
export type PersonInput = components['schemas']['PersonIn']
export type PersonChanges = components['schemas']['PersonPatch']

const path = (personId: string) => ({ params: { path: { person_id: personId } } })

export const personQuery = (personId: string) =>
  queryOptions({
    queryKey: ['people', personId],
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/people/{person_id}', { ...path(personId), signal })),
  })

export const familyQuery = (personId: string) =>
  queryOptions({
    queryKey: ['people', personId, 'family'],
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/people/{person_id}/family', { ...path(personId), signal })),
  })

/** Links that aren't family (friend, colleague, …); family comes from familyQuery. */
export const otherLinksQuery = (personId: string) =>
  queryOptions({
    queryKey: ['people', personId, 'links'],
    queryFn: async ({ signal }) => {
      const page = await unwrap(
        api.GET('/api/relationships', {
          params: { query: { person: personId, family: false } },
          signal,
        }),
      )
      return page.items
    },
  })

export const memoryAidsQuery = (personId: string) =>
  queryOptions({
    queryKey: ['people', personId, 'memory-aids'],
    queryFn: async ({ signal }) => {
      const page = await unwrap(
        api.GET('/api/memory-aids', { params: { query: { person: personId } }, signal }),
      )
      return page.items
    },
  })

export const noteQuery = (personId: string) =>
  queryOptions({
    queryKey: ['people', personId, 'note'],
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/people/{person_id}/note', { ...path(personId), signal })),
  })

export const timelineQuery = (personId: string) =>
  queryOptions({
    queryKey: ['people', personId, 'timeline'],
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/interactions', { params: { query: { person: personId } }, signal })),
  })

export const keepInTouchQuery = (personId: string) =>
  queryOptions({
    queryKey: ['people', personId, 'keep-in-touch'],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/keep-in-touch/{person_id}', {
          params: { path: { person_id: personId } },
          signal,
        }),
      ),
  })

export async function saveNote(queryClient: QueryClient, personId: string, body: string) {
  const note = await unwrap(
    api.PUT('/api/people/{person_id}/note', { ...path(personId), body: { body } }),
  )
  queryClient.setQueryData(noteQuery(personId).queryKey, note)
  // Notes are searchable, so the People list may change too.
  void queryClient.invalidateQueries({ queryKey: ['people', 'list'] })
  return note
}

export async function addMemoryAid(queryClient: QueryClient, personId: string, text: string) {
  await unwrap(api.POST('/api/memory-aids', { body: { person_id: personId, text, pinned: false } }))
  await queryClient.invalidateQueries({ queryKey: memoryAidsQuery(personId).queryKey })
}

export async function removeMemoryAid(queryClient: QueryClient, personId: string, aidId: string) {
  await unwrap(api.DELETE('/api/memory-aids/{aid_id}', { params: { path: { aid_id: aidId } } }))
  await queryClient.invalidateQueries({ queryKey: memoryAidsQuery(personId).queryKey })
}

export function createPerson(input: PersonInput) {
  return unwrap(api.POST('/api/people', { body: input }))
}

export function updatePerson(personId: string, changes: PersonChanges) {
  return unwrap(api.PATCH('/api/people/{person_id}', { ...path(personId), body: changes }))
}

/** After adding or changing someone: everything about people, and space counts. */
export async function refreshPeople(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['people'] }),
    queryClient.invalidateQueries({ queryKey: ['spaces'] }),
  ])
}
