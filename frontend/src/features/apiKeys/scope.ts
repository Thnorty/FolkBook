import type { ApiKey } from './queries'

/** What the wording needs from a key: the list's rows and the new key's summary use it. */
type Scoped = Pick<ApiKey, 'name' | 'read_only' | 'include_private' | 'limited' | 'spaces'>

export const PRIVATE_LABEL = '+ private notes'

export const accessLabel = (key: Scoped) => (key.read_only ? 'read-only' : 'read-write')

/** A limited key whose spaces are all gone sees nothing; it never widens to all spaces. */
export function spacesLabel(key: Scoped): string {
  if (!key.limited) return 'All spaces'
  if (key.spaces.length === 0) return 'No spaces left'
  return key.spaces.map((space) => space.name).join(', ')
}

/** "Obsidian sync · read-write + private notes · Friends, Family" */
export function scopeSummary(key: Scoped): string {
  const access = key.include_private ? `${accessLabel(key)} ${PRIVATE_LABEL}` : accessLabel(key)
  return [key.name, access, spacesLabel(key)].join(' · ')
}
