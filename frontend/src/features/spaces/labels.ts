import type { Space } from './queries'

/** Who a space belongs to and whether it's shared, as one short line (screen 4a). */
export function ownership(space: Space): string {
  if (space.role !== 'owner') {
    const owner = space.owner?.name ?? 'Someone'
    return space.role === 'editor' ? `${owner}'s · you can edit` : `${owner}'s · you can view`
  }
  if (space.member_count === 0) return 'Private'
  return `You own it · ${space.member_count} ${space.member_count === 1 ? 'member' : 'members'}`
}

export const peopleWord = (count: number) => (count === 1 ? 'person' : 'people')

export const peopleCount = (count: number) => `${count} ${peopleWord(count)}`
