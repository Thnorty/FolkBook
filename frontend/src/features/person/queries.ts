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
export type InteractionInput = components['schemas']['InteractionIn']
export type InteractionChanges = components['schemas']['InteractionPatch']
export type Relationship = components['schemas']['RelationshipOut']
export type FamilyRelation = components['schemas']['FamilyRelationOut']
export type RelationshipInput = components['schemas']['RelationshipIn']
export type RelationshipChanges = components['schemas']['RelationshipPatch']
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

/** Stored family links (parents, partners, other family), to change or end them. */
export const familyLinksQuery = (personId: string) =>
  queryOptions({
    queryKey: ['people', personId, 'family-links'],
    queryFn: async ({ signal }) => {
      const page = await unwrap(
        api.GET('/api/relationships', {
          params: { query: { person: personId, family: true } },
          signal,
        }),
      )
      return page.items
    },
  })

const linkPath = (linkId: string) => ({ params: { path: { link_id: linkId } } })

/** Who on `personId`'s page would move to Former if this link ended (screen 2m). */
export const endPreviewQuery = (personId: string, linkId: string) =>
  queryOptions({
    queryKey: ['people', personId, 'end-preview', linkId],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/relationships/{link_id}/end-preview', {
          params: { path: { link_id: linkId }, query: { person: personId } },
          signal,
        }),
      ),
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

export type KeepInTouchSetting = components['schemas']['KeepInTouchSchema']

/** Change how often to keep in touch, snooze or stop. Today's nudges follow. */
export async function saveKeepInTouch(
  queryClient: QueryClient,
  personId: string,
  setting: KeepInTouchSetting,
) {
  const saved = await unwrap(
    api.PUT('/api/keep-in-touch/{person_id}', { ...path(personId), body: setting }),
  )
  queryClient.setQueryData(keepInTouchQuery(personId).queryKey, saved)
  await queryClient.invalidateQueries({ queryKey: ['people', 'due'] })
  return saved
}

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
  const aid = await unwrap(
    api.POST('/api/memory-aids', { body: { person_id: personId, text, pinned: false } }),
  )
  await queryClient.invalidateQueries({ queryKey: memoryAidsQuery(personId).queryKey })
  return aid
}

export async function removeMemoryAid(queryClient: QueryClient, personId: string, aidId: string) {
  await unwrap(api.DELETE('/api/memory-aids/{aid_id}', { params: { path: { aid_id: aidId } } }))
  await queryClient.invalidateQueries({ queryKey: memoryAidsQuery(personId).queryKey })
}

const interactionPath = (interactionId: string) => ({
  params: { path: { interaction_id: interactionId } },
})

/*
 * Timeline writes. Afterwards refresh everything under ['people']: the timeline, and
 * "last talked" on the profile and in the People list.
 */

export async function logInteraction(queryClient: QueryClient, input: InteractionInput) {
  const interaction = await unwrap(api.POST('/api/interactions', { body: input }))
  await queryClient.invalidateQueries({ queryKey: ['people'] })
  return interaction
}

export async function updateInteraction(
  queryClient: QueryClient,
  interactionId: string,
  changes: InteractionChanges,
) {
  const interaction = await unwrap(
    api.PATCH('/api/interactions/{interaction_id}', {
      ...interactionPath(interactionId),
      body: changes,
    }),
  )
  await queryClient.invalidateQueries({ queryKey: ['people'] })
  return interaction
}

export async function deleteInteraction(queryClient: QueryClient, interactionId: string) {
  await unwrap(api.DELETE('/api/interactions/{interaction_id}', interactionPath(interactionId)))
  await queryClient.invalidateQueries({ queryKey: ['people'] })
}

/*
 * Link writes. Afterwards refresh everything under ['people']: both people's
 * connections, and the family worked out from them.
 */

async function afterLinkWrite<T>(queryClient: QueryClient, write: Promise<T>) {
  const result = await write
  await queryClient.invalidateQueries({ queryKey: ['people'] })
  return result
}

export const createRelationship = (queryClient: QueryClient, input: RelationshipInput) =>
  afterLinkWrite(queryClient, unwrap(api.POST('/api/relationships', { body: input })))

export const updateRelationship = (
  queryClient: QueryClient,
  linkId: string,
  changes: RelationshipChanges,
) =>
  afterLinkWrite(
    queryClient,
    unwrap(api.PATCH('/api/relationships/{link_id}', { ...linkPath(linkId), body: changes })),
  )

export const endRelationship = (queryClient: QueryClient, linkId: string, endedOn: string | null) =>
  afterLinkWrite(
    queryClient,
    unwrap(
      api.POST('/api/relationships/{link_id}/end', {
        ...linkPath(linkId),
        body: { ended_on: endedOn },
      }),
    ),
  )

export const reopenRelationship = (queryClient: QueryClient, linkId: string) =>
  afterLinkWrite(
    queryClient,
    unwrap(api.POST('/api/relationships/{link_id}/reopen', linkPath(linkId))),
  )

export const deleteRelationship = (queryClient: QueryClient, linkId: string) =>
  afterLinkWrite(queryClient, unwrap(api.DELETE('/api/relationships/{link_id}', linkPath(linkId))))

export function createPerson(input: PersonInput) {
  return unwrap(api.POST('/api/people', { body: input }))
}

export function updatePerson(personId: string, changes: PersonChanges) {
  return unwrap(api.PATCH('/api/people/{person_id}', { ...path(personId), body: changes }))
}

/** Delete someone. They're hidden at once and can be brought back for a minute. */
export function deletePerson(personId: string) {
  return unwrap(api.DELETE('/api/people/{person_id}', path(personId)))
}

/** Undo a delete. */
export async function restorePerson(queryClient: QueryClient, personId: string) {
  const person = await unwrap(api.POST('/api/people/{person_id}/restore', path(personId)))
  await refreshPeople(queryClient)
  return person
}

/** Take someone shared with you out of your book. Nobody else is affected. */
export function hidePerson(personId: string) {
  return unwrap(api.POST('/api/people/{person_id}/hide', path(personId)))
}

/** Add someone you took out back to your book, with your notes about them. */
export async function unhidePerson(queryClient: QueryClient, personId: string) {
  const person = await unwrap(api.POST('/api/people/{person_id}/unhide', path(personId)))
  await refreshPeople(queryClient)
  return person
}

/** After adding or changing someone: everything about people, and space counts. */
export async function refreshPeople(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['people'] }),
    queryClient.invalidateQueries({ queryKey: ['spaces'] }),
  ])
}
