import type { components } from '@/api/schema'

type TreeData = components['schemas']['FamilyTreeOut']
type TreePerson = components['schemas']['TreePersonOut']
type TreeStep = components['schemas']['TreeStepOut']
type TreeLink = components['schemas']['TreeLinkOut']
type Pronouns = components['schemas']['Pronouns']

export function step(
  relation: string,
  pronouns: Pronouns | null = null,
  extra: Partial<TreeStep> = {},
): TreeStep {
  return { relation, pronouns, parent_type: null, former: false, ...extra }
}

export function treePerson(
  id: string,
  name: string,
  generation: number,
  relation: TreeStep[] = [],
  extra: Partial<TreePerson> = {},
): TreePerson {
  return {
    id,
    name,
    photo_url: null,
    is_me: false,
    pronouns: relation.at(-1)?.pronouns ?? null,
    generation,
    relation,
    in_law: false,
    via_former: false,
    missing_parents: 0,
    ...extra,
  }
}

let linkCount = 0

export function parentLink(
  parent: string,
  child: string,
  parentType: TreeLink['parent_type'] = 'biological',
): TreeLink {
  linkCount += 1
  return {
    id: `link-${linkCount}`,
    type: 'parent',
    source: parent,
    target: child,
    parent_type: parentType,
    former: false,
  }
}

export function partnerLink(a: string, b: string, former = false): TreeLink {
  linkCount += 1
  return {
    id: `link-${linkCount}`,
    type: 'partner',
    source: a,
    target: b,
    parent_type: null,
    former,
  }
}

export function directLink(type: 'sibling' | 'cousin', a: string, b: string): TreeLink {
  linkCount += 1
  return { id: `link-${linkCount}`, type, source: a, target: b, parent_type: null, former: false }
}

/** Ela's family, as in the design (screen 3k); Ela is the viewer. */
export const ELAS_TREE: TreeData = {
  root: 'ela',
  people: [
    treePerson('orhan', 'Orhan Demir', 2, [step('grandparent', 'he')], { missing_parents: 2 }),
    treePerson('leyla', 'Leyla Demir', 2, [step('grandparent', 'she')], { missing_parents: 2 }),
    treePerson('murat', 'Murat Demir', 1, [step('parent', 'he', { parent_type: 'biological' })]),
    treePerson(
      'nilgun',
      'Nilgün Aksoy',
      1,
      [step('parent', 'she', { parent_type: 'biological' })],
      {
        missing_parents: 2,
      },
    ),
    treePerson('hakan', 'Hakan Şen', 1, [step('parent', 'he', { parent_type: 'step' })]),
    treePerson('zeynep', 'Zeynep Demir', 0, [step('sibling_in_law', 'she')], { in_law: true }),
    treePerson('can', 'Can Demir', 0, [step('sibling', 'he')]),
    treePerson('ela', 'Ela Demir', 0, [], { is_me: true, pronouns: 'she' }),
    treePerson('mateo', 'Mateo Ruiz', 0, [step('partner', 'he')]),
    treePerson('emir', 'Emir Demir', -1, [step('niece_nephew', 'he')]),
    treePerson('lina', 'Lina Ruiz', -1, [step('child', 'she', { parent_type: 'biological' })]),
  ],
  links: [
    parentLink('orhan', 'murat'),
    parentLink('leyla', 'murat'),
    partnerLink('orhan', 'leyla'),
    parentLink('murat', 'ela'),
    parentLink('nilgun', 'ela'),
    parentLink('murat', 'can'),
    parentLink('nilgun', 'can'),
    partnerLink('murat', 'nilgun', true),
    partnerLink('hakan', 'nilgun'),
    parentLink('hakan', 'ela', 'step'),
    partnerLink('can', 'zeynep'),
    parentLink('can', 'emir', 'adoptive'),
    parentLink('zeynep', 'emir', 'adoptive'),
    partnerLink('ela', 'mateo'),
    parentLink('ela', 'lina'),
    parentLink('mateo', 'lina'),
  ],
}
