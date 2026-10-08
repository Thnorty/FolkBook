import type { QueryClient } from '@tanstack/react-query'
import { api, formUpload, unwrap } from '@/api/client'
import type { components } from '@/api/schema'

export type ImportPreview = components['schemas']['PreviewOut']
export type Contact = ImportPreview['contacts'][number]
export type ContactMatch = NonNullable<Contact['match']>
export type Choices = components['schemas']['ChoicesIn']
export type ImportResult = components['schemas']['ImportOut']

/** The contacts in a .vcf, each with who they may already be. Nothing is stored. */
export function previewImport(file: File) {
  return unwrap(api.POST('/api/imports/preview', formUpload({ file })))
}

/** Import the same file with the user's choices; people and spaces change. */
export async function runImport(queryClient: QueryClient, file: File, choices: Choices) {
  const result = await unwrap(api.POST('/api/imports', formUpload({ file, choices })))
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['people'] }),
    queryClient.invalidateQueries({ queryKey: ['spaces'] }),
  ])
  return result
}
