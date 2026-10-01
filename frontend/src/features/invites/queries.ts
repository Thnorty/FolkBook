import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import type { components } from '@/api/schema'

export type InviteInput = components['schemas']['InviteIn']
export type InvitePreview = components['schemas']['InvitePreviewOut']

/** A new invite link (by default: works once, for a week). */
export function createInvite(input: InviteInput = {}) {
  return unwrap(api.POST('/api/invites', { body: input }))
}

/** The full address to share for an invite's `path`. */
export const inviteLink = (path: string) => `${window.location.origin}${path}`

/** What an invite link offers, for someone opening it (no account needed). */
export const invitePreviewQuery = (token: string) =>
  queryOptions({
    queryKey: ['invites', token],
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/invites/by-token/{token}', { params: { path: { token } }, signal })),
    retry: false, // an unusable link stays unusable
  })

/** Join the invite's space with the account you're logged in with. */
export async function joinWithInvite(queryClient: QueryClient, token: string) {
  const space = await unwrap(
    api.POST('/api/invites/by-token/{token}/join', { params: { path: { token } } }),
  )
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['spaces'] }),
    queryClient.invalidateQueries({ queryKey: ['people'] }),
  ])
  return space
}
