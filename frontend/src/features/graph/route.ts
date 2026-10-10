import type { components } from '@/api/schema'
import type { Person } from '@/features/people/queries'
import { firstNameOf, words } from '@/lib/names'
import { lineLabel } from './graphModel'

/** A way from your Me to someone, one step per link or shared space. */
export type Route = components['schemas']['PathOut']
export type Step = Route['hops'][number]

/** A step reads like the line it went along: "friend", "shares Hackathon 2026". */
export const stepLabel = (step: Step): string => lineLabel(step) ?? ''

/** "How you know Tom · 2 steps". */
export function routeTitle(name: string, steps: number): string {
  return `How you know ${firstNameOf(name)} · ${steps} ${steps === 1 ? 'step' : 'steps'}`
}

/** "Also via Emma Yılmaz: friend, then cousin": another route, by its first person. */
export function alsoVia(route: Route): string {
  return `Also via ${route.hops[0].target.name}: ${route.hops.map(stepLabel).join(', then ')}`
}

/**
 * Why someone is in your book when they're someone else's: "Tom came into your book with
 * Hackathon 2026, shared by Defne." Nothing for your own people or another user's Me
 * (the route already says you share a space with them).
 */
export function whyLine(
  person: Pick<Person, 'id' | 'name' | 'is_me' | 'is_mine' | 'owner' | 'spaces'>,
): string | null {
  const { owner } = person
  if (person.is_me || person.is_mine || !owner || owner.id === person.id) return null
  const name = firstNameOf(person.name)
  const by = firstNameOf(owner.name)
  if (person.spaces.length === 0) return `${name} came into your book through ${by}.`
  const spaces = words(person.spaces.map((space) => space.name))
  return `${name} came into your book with ${spaces}, shared by ${by}.`
}
