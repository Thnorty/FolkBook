import { limitedToLabel } from '@/features/spaces/labels'
import type { ApiKey } from './queries'

/** What the wording needs from a key: the list's rows and the new key's summary use it. */
type Scoped = Pick<ApiKey, 'name' | 'read_only' | 'include_private' | 'limited' | 'spaces'>

export const PRIVATE_LABEL = '+ private notes'

export const accessLabel = (key: Scoped) => (key.read_only ? 'read-only' : 'read-write')

export const spacesLabel = (key: Scoped) => limitedToLabel(key, 'All spaces')

/** "Obsidian sync · read-write + private notes · Friends, Family" */
export function scopeSummary(key: Scoped): string {
  const access = key.include_private ? `${accessLabel(key)} ${PRIVATE_LABEL}` : accessLabel(key)
  return [key.name, access, spacesLabel(key)].join(' · ')
}
