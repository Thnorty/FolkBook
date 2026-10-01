import type { Relationship } from './queries'

/*
 * The choices in the connect form (screens 2k, 2l), seen from the profile you're on:
 * "Parent of Emma" means the other person is Emma's parent. Each one is stored as a
 * link type plus a direction ("person_a is the <type> of person_b").
 */

type LinkType = Relationship['type']

const KINDS = {
  parent: { type: 'parent', otherFirst: true },
  child: { type: 'parent', otherFirst: false },
  partner: { type: 'partner', otherFirst: true },
  sibling: { type: 'sibling', otherFirst: true },
  cousin: { type: 'cousin', otherFirst: true },
  grandparent: { type: 'grandparent', otherFirst: true },
  grandchild: { type: 'grandparent', otherFirst: false },
  aunt_uncle: { type: 'aunt_uncle', otherFirst: true },
  niece_nephew: { type: 'aunt_uncle', otherFirst: false },
  friend: { type: 'friend', otherFirst: true },
  colleague: { type: 'colleague', otherFirst: true },
  classmate: { type: 'classmate', otherFirst: true },
  met_at: { type: 'met_at', otherFirst: true },
  custom: { type: 'custom', otherFirst: true },
} as const satisfies Record<string, { type: LinkType; otherFirst: boolean }>

export type ConnectionKind = keyof typeof KINDS

/** The form's three groups, in order. */
export const KIND_GROUPS = {
  family: ['parent', 'child', 'partner'],
  otherFamily: ['sibling', 'cousin', 'grandparent', 'grandchild', 'aunt_uncle', 'niece_nephew'],
  social: ['friend', 'colleague', 'classmate', 'met_at', 'custom'],
} as const satisfies Record<string, ConnectionKind[]>

const CHIPS: Record<ConnectionKind, string> = {
  parent: 'Parent of {name}',
  child: 'Child of {name}',
  partner: 'Partner',
  sibling: 'Sibling',
  cousin: 'Cousin',
  grandparent: 'Grandparent',
  grandchild: 'Grandchild',
  aunt_uncle: 'Aunt / uncle',
  niece_nephew: 'Niece / nephew',
  friend: 'Friend',
  colleague: 'Colleague',
  classmate: 'Classmate',
  met_at: 'Met at…',
  custom: 'Custom…',
}

/** What a choice says on its chip: "Parent of Emma", "Aunt / uncle". */
export function kindChip(kind: ConnectionKind, firstName: string): string {
  return CHIPS[kind].replace('{name}', firstName)
}

export const needsParentType = (kind: ConnectionKind) => KINDS[kind].type === 'parent'
export const needsLabel = (kind: ConnectionKind) => kind === 'met_at' || kind === 'custom'

/** How a choice is stored, between the profile's person and the other one. */
export function linkFor(kind: ConnectionKind, personId: string, otherId: string) {
  const { type, otherFirst } = KINDS[kind]
  const [person_a_id, person_b_id] = otherFirst ? [otherId, personId] : [personId, otherId]
  return { type, person_a_id, person_b_id }
}

/** The choice a stored link is, seen from `personId`'s profile. */
export function kindOf(link: Relationship, personId: string): ConnectionKind {
  const otherFirst = link.person_b.id === personId
  // Every link type has a choice, so one always matches.
  return (Object.keys(KINDS) as ConnectionKind[]).find(
    (key) =>
      KINDS[key].type === link.type && (!directional(key) || KINDS[key].otherFirst === otherFirst),
  ) as ConnectionKind
}

const directional = (kind: ConnectionKind) =>
  Object.values(KINDS).filter(({ type }) => type === KINDS[kind].type).length > 1
