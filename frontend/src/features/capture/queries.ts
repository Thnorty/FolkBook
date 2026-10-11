import type { QueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import type { components } from '@/api/schema'

export type Draft = components['schemas']['DraftOut']
export type DraftPerson = Draft['people'][number]
export type Candidate = DraftPerson['candidates'][number]
export type SuggestBody = components['schemas']['SuggestIn']
export type SaveBody = components['schemas']['SaveIn']
export type Saved = components['schemas']['SavedOut']
export type Undone = components['schemas']['UndoneOut']

/** What the AI read in the text, matched to your people. Nothing is saved yet. */
export const suggestCapture = (body: SuggestBody, signal?: AbortSignal) =>
  unwrap(api.POST('/api/capture/suggest', { body, signal }))

export async function saveCapture(queryClient: QueryClient, body: SaveBody): Promise<Saved> {
  const saved = await unwrap(api.POST('/api/capture/save', { body }))
  await refreshAfterCapture(queryClient)
  return saved
}

export async function undoCapture(queryClient: QueryClient, id: string): Promise<Undone> {
  const undone = await unwrap(
    api.POST('/api/capture/{capture_id}/undo', { params: { path: { capture_id: id } } }),
  )
  await refreshAfterCapture(queryClient)
  return undone
}

// A capture touches people, their spaces, links and private notes, and Today.
function refreshAfterCapture(queryClient: QueryClient) {
  return Promise.all(
    [['people'], ['spaces'], ['remember'], ['fill-in']].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  )
}
