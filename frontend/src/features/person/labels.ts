import type { components } from '@/api/schema'

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

/** "half_sibling" → "half-sibling". Unknown codes show as written, with spaces. */
export function relationLabel(code: string): string {
  return RELATIONS[code] ?? code.replaceAll('_', ' ')
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

/** How often to keep in touch: "Every week", "Every 2 months". */
export function intervalLabel(days: number): string {
  if (days % 365 === 0) return days === 365 ? 'Every year' : `Every ${days / 365} years`
  if (days % 30 === 0) return days === 30 ? 'Every month' : `Every ${days / 30} months`
  if (days % 7 === 0) return days === 7 ? 'Every week' : `Every ${days / 7} weeks`
  return days === 1 ? 'Every day' : `Every ${days} days`
}
