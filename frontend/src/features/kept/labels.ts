import type { components } from '@/api/schema'
import { countOf } from '@/features/person/labels'

export type AccessEnded = components['schemas']['AccessEndedOut']
type Written = Pick<
  components['schemas']['KeptPreviewOut'],
  'notes' | 'memory_aids' | 'interactions'
>

const list = new Intl.ListFormat(undefined, { type: 'conjunction' })

/** "Tom, Ola and Jin": first names, for toasts. */
export function firstNames(people: { name: string }[]): string {
  return list.format(people.map((person) => person.name.split(' ')[0]))
}

/** What someone else did, as a sentence without its full stop. */
export function whatEnded({ reason, by, space, about }: AccessEnded): string {
  switch (reason) {
    case 'removed':
      return `${by} removed you from ${space}`
    case 'stopped_sharing':
      return `${by} stopped sharing ${space}`
    case 'space_deleted':
      return `${by} deleted ${space}`
    case 'member_left':
      return `${about} is no longer in ${space}`
    case 'person_removed':
      return `${by} took ${about} out of ${space}`
    case 'person_deleted':
      return `${by} deleted ${about}`
  }
}

/** Whether you lost a whole space, rather than one person in it. */
export const lostTheSpace = ({ reason }: AccessEnded) =>
  reason === 'removed' || reason === 'stopped_sharing' || reason === 'space_deleted'

/** "1 note · 2 memory aids": what you wrote about someone. */
export function writtenSummary({ notes, memory_aids, interactions }: Written): string {
  return [
    notes > 0 && countOf(notes, 'note'),
    memory_aids > 0 && countOf(memory_aids, 'memory aid'),
    interactions > 0 && countOf(interactions, 'timeline entry', 'timeline entries'),
  ]
    .filter(Boolean)
    .join(' · ')
}
