import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { api, formUpload, unwrap } from '@/api/client'
import type { components } from '@/api/schema'

export type ImportPreview = components['schemas']['PreviewOut']
export type Contact = ImportPreview['contacts'][number]
export type ContactMatch = NonNullable<Contact['match']>
export type Choices = components['schemas']['ChoicesIn']
export type ImportResult = components['schemas']['ImportOut']
export type RecentImport = components['schemas']['RecentImportOut']

/** The contacts in a .vcf, each with who they may already be. Nothing is stored. */
export function previewImport(file: File) {
  return unwrap(api.POST('/api/imports/preview', formUpload({ file })))
}

/** Import the same file with the user's choices; people and spaces change. */
export async function runImport(queryClient: QueryClient, file: File, choices: Choices) {
  const result = await unwrap(api.POST('/api/imports', formUpload({ file, choices })))
  await refreshAfterImport(queryClient)
  return result
}

/** Your imports, newest first. */
export const recentImportsQuery = queryOptions({
  queryKey: ['imports'],
  queryFn: ({ signal }) => unwrap(api.GET('/api/imports', { signal })),
})

export const importQuery = (id: string) =>
  queryOptions({
    queryKey: ['imports', id],
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/imports/{import_id}', { params: { path: { import_id: id } }, signal })),
  })

/** Who undoing the import deletes, who stays, and who loses details. */
export const undoPreviewQuery = (id: string) =>
  queryOptions({
    queryKey: ['imports', id, 'undo-preview'],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/imports/{import_id}/undo-preview', {
          params: { path: { import_id: id } },
          signal,
        }),
      ),
    staleTime: 0, // what's been written since changes it
  })

export async function undoImport(queryClient: QueryClient, id: string) {
  const result = await unwrap(
    api.POST('/api/imports/{import_id}/undo', { params: { path: { import_id: id } } }),
  )
  await refreshAfterImport(queryClient)
  return result
}

/** The toast's Undo: bring the import back, within a minute. */
export async function redoImport(queryClient: QueryClient, id: string) {
  const result = await unwrap(
    api.POST('/api/imports/{import_id}/redo', { params: { path: { import_id: id } } }),
  )
  await refreshAfterImport(queryClient)
  return result
}

function refreshAfterImport(queryClient: QueryClient) {
  return Promise.all(
    [['people'], ['spaces'], ['imports'], ['fill-in']].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  )
}
