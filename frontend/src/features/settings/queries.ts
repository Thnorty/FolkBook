import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { api, formUpload, unwrap } from '@/api/client'
import { currentUserQuery, forgetOtherData } from '@/api/session'
import type { components } from '@/api/schema'

export type ReminderSettings = components['schemas']['ReminderSettingsSchema']

/** Where you're signed in, most recently used first. */
export const devicesQuery = queryOptions({
  queryKey: ['auth', 'devices'],
  queryFn: async ({ signal }) => (await unwrap(api.GET('/api/auth/devices', { signal }))).items,
})

export async function signOutDevice(queryClient: QueryClient, deviceId: string) {
  await unwrap(
    api.DELETE('/api/auth/devices/{device_id}', { params: { path: { device_id: deviceId } } }),
  )
  await queryClient.invalidateQueries({ queryKey: devicesQuery.queryKey })
}

export async function signOutOtherDevices(queryClient: QueryClient) {
  await unwrap(api.POST('/api/auth/devices/sign-out-others'))
  await queryClient.invalidateQueries({ queryKey: devicesQuery.queryKey })
}

/** Change your password; every other device is signed out. */
export async function changePassword(
  queryClient: QueryClient,
  body: components['schemas']['PasswordIn'],
) {
  await unwrap(api.POST('/api/auth/password', { body }))
  await queryClient.invalidateQueries({ queryKey: devicesQuery.queryKey })
}

export const reminderSettingsQuery = queryOptions({
  queryKey: ['reminder-settings'],
  queryFn: ({ signal }) => unwrap(api.GET('/api/keep-in-touch/settings', { signal })),
})

/** Nudges on or off, and the default interval. Today and profiles follow. */
export async function saveReminderSettings(queryClient: QueryClient, settings: ReminderSettings) {
  const saved = await unwrap(api.PUT('/api/keep-in-touch/settings', { body: settings }))
  queryClient.setQueryData(reminderSettingsQuery.queryKey, saved)
  await queryClient.invalidateQueries({ queryKey: ['people'] })
  return saved
}

/** This server's FolkBook version, and where its source code is (AGPL). */
export const aboutQuery = queryOptions({
  queryKey: ['about'],
  queryFn: ({ signal }) => unwrap(api.GET('/api/about', { signal })),
  staleTime: Infinity,
})

/** The full export (.zip): downloaded by the browser from a plain link. */
export const EXPORT_URL = '/api/export/everything'

/** A copy of one person (.zip, like the full export) to keep before tearing them out. */
export const personCopyUrl = (personId: string) =>
  `/api/export/people/${encodeURIComponent(personId)}`

/** The contacts (.vcf): everyone in your book, or one space's people. */
export const contactsExportUrl = (spaceId?: string) =>
  spaceId ? `/api/export/contacts?space=${encodeURIComponent(spaceId)}` : '/api/export/contacts'

/** What the full export holds, for the line under "Everything". */
export const exportSummaryQuery = queryOptions({
  queryKey: ['export', 'summary'],
  queryFn: ({ signal }) => unwrap(api.GET('/api/export/summary', { signal })),
})

export type RestoreSummary = components['schemas']['RestoreSummary']

/** What a full export holds, if it can be restored into your book. Changes nothing. */
export function checkRestore(file: File) {
  return unwrap(api.POST('/api/export/restore/check', formUpload({ file })))
}

/** Replace everything in your book with the export in `file`. */
export async function restoreBook(queryClient: QueryClient, file: File, confirmEmail: string) {
  const restored = await unwrap(
    api.POST('/api/export/restore', formUpload({ file, confirm_email: confirmEmail })),
  )
  // Nothing cached from the old book stays; Me (and so who you are) may have changed.
  forgetOtherData(queryClient)
  await queryClient.invalidateQueries({ queryKey: currentUserQuery.queryKey })
  return restored
}

export type User = components['schemas']['UserOut']
export type Invite = components['schemas']['InviteOut']

/** Everyone on this server (admins only). */
export const usersQuery = queryOptions({
  queryKey: ['users'],
  queryFn: async ({ signal }) => (await unwrap(api.GET('/api/users', { signal }))).items,
})

/** Make someone an admin or not, or (de)activate them. */
export async function updateUser(
  queryClient: QueryClient,
  userId: string,
  changes: components['schemas']['UserPatch'],
) {
  const user = await unwrap(
    api.PATCH('/api/users/{user_id}', { params: { path: { user_id: userId } }, body: changes }),
  )
  await queryClient.invalidateQueries({ queryKey: usersQuery.queryKey })
  return user
}

/** A one-time password reset link for someone (admins only; shown once). */
export function createResetLink(userId: string) {
  return unwrap(api.POST('/api/auth/password-resets', { body: { user_id: userId } }))
}

/** Your invite links; admins see every invite on the server. */
export const invitesQuery = queryOptions({
  queryKey: ['invites', 'list'],
  queryFn: async ({ signal }) => (await unwrap(api.GET('/api/invites', { signal }))).items,
})

export async function revokeInvite(queryClient: QueryClient, inviteId: string) {
  await unwrap(
    api.DELETE('/api/invites/{invite_id}', { params: { path: { invite_id: inviteId } } }),
  )
  await queryClient.invalidateQueries({ queryKey: invitesQuery.queryKey })
}
