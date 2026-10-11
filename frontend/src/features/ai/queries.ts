import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import type { components } from '@/api/schema'

export type AiSettings = components['schemas']['AiSettingsOut']
export type AiProvider = components['schemas']['AiProviderOut']
export type AiProviderIn = components['schemas']['AiProviderIn']
export type AiCheckIn = components['schemas']['AiCheckIn']
export type AiScope = 'mine' | 'server'

/** Your own AI, the server's, and which one Quick capture uses. */
export const aiSettingsQuery = queryOptions({
  queryKey: ['ai'],
  queryFn: ({ signal }) => unwrap(api.GET('/api/ai', { signal })),
})

export async function saveAi(queryClient: QueryClient, scope: AiScope, body: AiProviderIn) {
  const settings = await unwrap(
    scope === 'mine' ? api.PUT('/api/ai/mine', { body }) : api.PUT('/api/ai/server', { body }),
  )
  queryClient.setQueryData(aiSettingsQuery.queryKey, settings)
  return settings
}

export async function removeAi(queryClient: QueryClient, scope: AiScope) {
  const settings = await unwrap(
    scope === 'mine' ? api.DELETE('/api/ai/mine') : api.DELETE('/api/ai/server'),
  )
  queryClient.setQueryData(aiSettingsQuery.queryKey, settings)
  return settings
}

/** The models the AI offers, or why they couldn't be listed. */
export const fetchModels = (body: AiCheckIn) => unwrap(api.POST('/api/ai/models', { body }))

/** Ask the AI one word: did it answer, and how fast? */
export const testAi = (body: AiCheckIn) => unwrap(api.POST('/api/ai/test', { body }))
