import type { components } from '@/api/schema'
import { formatRelativeDay } from '@/lib/dates'

/* Words shown for codes the API sends (relation types, timeline kinds). One place, so
   every screen says the same thing. Gendered names ("sister") come with #54. */

const RELATIONS: Record<string, string> = {
  parent: 'parent',
  child: 'child',
  partner: 'partner',
  sibling: 'sibling',
  half_sibling: 'half-sibling',
  step_sibling: 'step-sibling',
  step_parent: 'step-parent',
  step_child: 'step-child',
  grandparent: 'grandparent',
  grandchild: 'grandchild',
  aunt_uncle: 'aunt or uncle',
  niece_nephew: 'niece or nephew',
  cousin: 'cousin',
  parent_in_law: 'parent-in-law',
  child_in_law: 'child-in-law',
  sibling_in_law: 'sibling-in-law',
  friend: 'friend',
  colleague: 'colleague',
  classmate: 'classmate',
  met_at: 'met at',
}

export type Pronouns = NonNullable<components['schemas']['PersonOut']['pronouns']>

/** What to call someone given their pronouns: [she, he]. Partners stay "partner". */
const GENDERED: Record<string, [string, string]> = {
  parent: ['mother', 'father'],
  child: ['daughter', 'son'],
  sibling: ['sister', 'brother'],
  half_sibling: ['half-sister', 'half-brother'],
  step_sibling: ['stepsister', 'stepbrother'],
  step_parent: ['stepmother', 'stepfather'],
  step_child: ['stepdaughter', 'stepson'],
  grandparent: ['grandmother', 'grandfather'],
  grandchild: ['granddaughter', 'grandson'],
  aunt_uncle: ['aunt', 'uncle'],
  niece_nephew: ['niece', 'nephew'],
  parent_in_law: ['mother-in-law', 'father-in-law'],
  child_in_law: ['daughter-in-law', 'son-in-law'],
  sibling_in_law: ['sister-in-law', 'brother-in-law'],
}

/**
 * "half_sibling" → "half-sibling", or "half-sister" for someone who goes by she.
 * Without pronouns (or with they) the name stays neutral. Unknown codes show as
 * written, with spaces.
 */
export function relationLabel(code: string, pronouns?: Pronouns | null): string {
  const gendered = GENDERED[code]
  if (gendered && pronouns === 'she') return gendered[0]
  if (gendered && pronouns === 'he') return gendered[1]
  return RELATIONS[code] ?? code.replaceAll('_', ' ')
}

/** The choices for pronouns, as the form shows them. */
export const PRONOUNS: Record<Pronouns, string> = {
  she: 'she / her',
  he: 'he / him',
  they: 'they / them',
}

/** What a stored link says about the other person: "friend", "met at Hackathon 2026". */
export function linkLabel({ type, label }: components['schemas']['RelationshipOut']): string {
  if (type === 'met_at') return `met at ${label}`
  if (type === 'custom') return label
  return relationLabel(type)
}

type Kind = components['schemas']['InteractionOut']['kind']

export const INTERACTION_KINDS: Record<Kind, string> = {
  met: 'Met',
  call: 'Call',
  message: 'Message',
  event: 'Event',
  custom: 'Other',
}

const DID: Partial<Record<Kind, string>> = { met: 'met', call: 'called', message: 'messaged' }

/** A new timeline entry in a few words: "met Emma today", "Coffee with Emma yesterday". */
export function loggedSummary(
  {
    kind,
    label,
    occurred_on,
  }: Pick<components['schemas']['InteractionOut'], 'kind' | 'label' | 'occurred_on'>,
  firstName: string,
  today?: Date,
): string {
  const what =
    DID[kind] && !label
      ? `${DID[kind]} ${firstName}`
      : `${label || INTERACTION_KINDS[kind]} with ${firstName}`
  return `${what} ${formatRelativeDay(occurred_on, today)}`
}

/** "1 memory aid", "2 timeline entries". */
export function countOf(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

/** How often to keep in touch: "Every week", "Every 2 months". */
export function intervalLabel(days: number): string {
  if (days % 365 === 0) return days === 365 ? 'Every year' : `Every ${days / 365} years`
  if (days % 30 === 0) return days === 30 ? 'Every month' : `Every ${days / 30} months`
  if (days % 7 === 0) return days === 7 ? 'Every week' : `Every ${days / 7} weeks`
  return days === 1 ? 'Every day' : `Every ${days} days`
}
