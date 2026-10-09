import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import type { components } from '@/api/schema'

export type ApiKey = components['schemas']['ApiKeyOut']
export type CreatedApiKey = components['schemas']['CreatedApiKeyOut']
export type ApiKeyIn = components['schemas']['ApiKeyIn']

/** Your API keys, newest first. Never the keys themselves, only their last five. */
export const apiKeysQuery = queryOptions({
  queryKey: ['api-keys'],
  queryFn: async ({ signal }) => (await unwrap(api.GET('/api/api-keys', { signal }))).items,
})

/** Make a key. The answer holds the full key, so it never goes into the cache. */
export async function createApiKey(queryClient: QueryClient, body: ApiKeyIn) {
  const created = await unwrap(api.POST('/api/api-keys', { body }))
  await queryClient.invalidateQueries({ queryKey: apiKeysQuery.queryKey })
  return created
}

/** Revoke a key (or delete an expired one): anything using it gets 401 from now on. */
export async function revokeApiKey(queryClient: QueryClient, keyId: string) {
  await unwrap(api.DELETE('/api/api-keys/{key_id}', { params: { path: { key_id: keyId } } }))
  await queryClient.invalidateQueries({ queryKey: apiKeysQuery.queryKey })
}
