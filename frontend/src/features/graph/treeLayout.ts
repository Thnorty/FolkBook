import type { components } from '@/api/schema'
import { firstNameOf } from '@/lib/names'

/* Family tree mode (screens 3k, 3l): where everyone goes. Plain data in, positions and
   lines out, so it's tested without drawing anything. */

export type TreeData = components['schemas']['FamilyTreeOut']
export type TreePerson = components['schemas']['TreePersonOut']
type TreeLink = components['schemas']['TreeLinkOut']

export type TreeToggles = { formerPartners: boolean; inLaws: boolean }
export type PlacedPerson = { person: TreePerson; x: number; y: number }
/** An empty "Add parent" place above someone with fewer than two parents. */
export type PlacedSlot = { childId: string; childName: string; x: number; y: number; key: string }
export type TreeLine = {
  id: string
  kind: 'partner' | 'child' | 'other' | 'slot'
  points: [number, number][]
  label?: 'partner' | 'former' | 'adopted' | 'step'
  dashed: boolean // ended partnerships, slots
  dotted: boolean // direct "other family" links
}
export type TreeRow = { generation: number; y: number; label: string }
export type TreeLayout = {
  people: PlacedPerson[]
  slots: PlacedSlot[]
  lines: TreeLine[]
  rows: TreeRow[]
  width: number
  height: number
  /** Generations shown above and below the tree's person. */
  up: number
  down: number
}

/** Room for one person (centre to centre) and one generation. */
export const NODE_WIDTH = 120
export const ROW_HEIGHT = 140
const SWEEPS = 8
const PLACE_ROUNDS = 8

const LINE_LABELS: Record<string, TreeLine['label']> = { adoptive: 'adopted', step: 'step' }
const ROW_NAMES: Record<number, string> = {
  3: 'Great-grandparents',
  2: 'Grandparents',
  1: 'Parents',
  [-1]: 'Children',
  [-2]: 'Grandchildren',
  [-3]: 'Great-grandchildren',
}

/** Who the toggles leave in the tree. */
export function shownPeople(data: TreeData, toggles: TreeToggles): TreePerson[] {
  return data.people.filter(
    (person) =>
      (toggles.inLaws || !person.in_law) && (toggles.formerPartners || !person.via_former),
  )
}

/** How many generations are shown above and below the tree's person. */
export function generationSpan(people: TreePerson[]): { up: number; down: number } {
  const generations = people.map((person) => person.generation)
  return {
    up: Math.max(0, ...generations),
    down: Math.max(0, ...generations.map((generation) => -generation)),
  }
}

/** "Grandparents", "Your generation", "Nilgün's generation", "4 generations up"… */
export function rowLabel(generation: number, rootName: string, rootIsMe: boolean): string {
  if (generation === 0)
    return rootIsMe ? 'Your generation' : `${firstNameOf(rootName)}'s generation`
  const away = Math.abs(generation)
  return ROW_NAMES[generation] ?? `${away} generations ${generation > 0 ? 'up' : 'down'}`
}

/** A person or a slot: one place in a row. */
type Node = { id: string; generation: number; name: string }

/** Two parent links between the same people (one private, one in a space) draw one line. */
function distinctLinks(links: TreeLink[], shown: Set<string>): TreeLink[] {
  const seen = new Set<string>()
  return links.filter((link) => {
    if (!shown.has(link.source) || !shown.has(link.target)) return false
    const pair =
      link.type === 'parent' ? [link.source, link.target] : [link.source, link.target].toSorted()
    const key = `${link.type}:${pair.join(':')}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Partners in the same row, as chains: [Murat, Nilgün, Hakan]. */
function units(row: Node[], partners: Map<string, Set<string>>): string[][] {
  const inRow = new Set(row.map((node) => node.id))
  const names = new Map(row.map((node) => [node.id, node.name]))
  const byName = (a: string, b: string) =>
    names.get(a)!.localeCompare(names.get(b)!) || a.localeCompare(b)
  const near = (id: string) =>
    [...(partners.get(id) ?? [])].filter((p) => inRow.has(p)).toSorted(byName)
  const placed = new Set<string>()
  const found: string[][] = []
  for (const start of row.map((node) => node.id).toSorted(byName)) {
    if (placed.has(start)) continue
    // The whole group of partners, then walked from an end so partners sit side by side.
    const group = new Set([start])
    for (const id of group) near(id).forEach((p) => group.add(p))
    const end = [...group].toSorted(byName).find((id) => near(id).length <= 1) ?? start
    const chain: string[] = []
    let here: string | undefined = end
    while (here) {
      chain.push(here)
      placed.add(here)
      here = near(here).find((p) => !placed.has(p))
    }
    for (const id of [...group].toSorted(byName)) {
      if (!placed.has(id)) {
        chain.push(id)
        placed.add(id)
      }
    }
    found.push(chain)
  }
  return found
}

const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length

/** Units side by side in the given order, from 0: where they are while rows are ordered. */
function packTight(row: string[][], x: Map<string, number>) {
  let at = 0
  for (const unit of row) {
    unit.forEach((id, i) => x.set(id, (at + i) * NODE_WIDTH))
    at += unit.length
  }
}

type Block = { units: string[][]; starts: number[]; size: number }
/** Where a block of units starts: the average of where its units want it to. */
const blockStart = (block: Block) => mean(block.starts)

/**
 * Each unit as near the x it wants as the row allows, in the given order. Units that would
 * overlap form a block centred on what they want together, so nothing drifts to one side.
 */
function place(row: string[][], x: Map<string, number>, want: (unit: string[]) => number) {
  const blocks: Block[] = []
  for (const unit of row) {
    let block: Block = {
      units: [unit],
      starts: [want(unit) - ((unit.length - 1) * NODE_WIDTH) / 2],
      size: unit.length * NODE_WIDTH,
    }
    while (blocks.length) {
      const before = blocks.at(-1)!
      if (blockStart(before) + before.size <= blockStart(block)) break
      blocks.pop()
      block = {
        units: [...before.units, ...block.units],
        // Each unit's wish, as a wish for where the whole block starts.
        starts: [...before.starts, ...block.starts.map((start) => start - before.size)],
        size: before.size + block.size,
      }
    }
    blocks.push(block)
  }
  for (const block of blocks) {
    let at = blockStart(block)
    for (const unit of block.units) {
      unit.forEach((id, i) => x.set(id, at + i * NODE_WIDTH))
      at += unit.length * NODE_WIDTH
    }
  }
}

export function layoutTree(data: TreeData, toggles: TreeToggles): TreeLayout {
  const people = shownPeople(data, toggles)
  const shown = new Set(people.map((person) => person.id))
  const links = distinctLinks(data.links, shown)
  const root = data.people.find((person) => person.id === data.root)

  const slots = people.flatMap((person) =>
    Array.from({ length: person.missing_parents }, (_, i) => ({
      key: `${person.id}:${i}`,
      childId: person.id,
      childName: person.name,
      generation: person.generation + 1,
    })),
  )
  const nodes: Node[] = [
    ...people.map(({ id, generation, name }) => ({ id, generation, name })),
    ...slots.map(({ key, generation, childName }) => ({
      id: `slot:${key}`,
      generation,
      name: childName,
    })),
  ]

  const parentsOf = new Map<string, string[]>()
  const childrenOf = new Map<string, string[]>()
  const relate = (parent: string, child: string) => {
    parentsOf.set(child, [...(parentsOf.get(child) ?? []), parent])
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), child])
  }
  const partners = new Map<string, Set<string>>()
  const direct = new Map<string, string[]>()
  for (const link of links) {
    if (link.type === 'parent') relate(link.source, link.target)
    else if (link.type === 'partner') {
      partners.set(link.source, (partners.get(link.source) ?? new Set()).add(link.target))
      partners.set(link.target, (partners.get(link.target) ?? new Set()).add(link.source))
    } else {
      direct.set(link.source, [...(direct.get(link.source) ?? []), link.target])
      direct.set(link.target, [...(direct.get(link.target) ?? []), link.source])
    }
  }
  // A slot's two places stay together, like partners, above their person. Slots follow
  // their person (as their "children") but never pull people around (as parents).
  for (const slot of slots) {
    childrenOf.set(`slot:${slot.key}`, [slot.childId])
    const other = `slot:${slot.childId}:${1 - Number(slot.key.split(':')[1])}`
    if (slot.key.endsWith(':0') && slots.some((s) => `slot:${s.key}` === other)) {
      partners.set(`slot:${slot.key}`, new Set([other]))
      partners.set(other, new Set([`slot:${slot.key}`]))
    }
  }

  // A first order: as found walking out from the tree's person (partners, then children,
  // then parents, then direct links), so each family starts out together.
  const names = new Map(nodes.map((node) => [node.id, node.name]))
  const byName = (ids: Iterable<string>) =>
    [...ids].toSorted((a, b) => names.get(a)!.localeCompare(names.get(b)!) || a.localeCompare(b))
  const found = new Map<string, number>()
  const stack = [data.root, ...byName(names.keys()).toReversed()]
  while (stack.length) {
    const id = stack.pop()!
    if (found.has(id) || !names.has(id)) continue
    found.set(id, found.size)
    const next = [
      ...byName(partners.get(id) ?? []),
      ...byName(childrenOf.get(id) ?? []),
      ...byName(parentsOf.get(id) ?? []),
      ...byName(direct.get(id) ?? []),
    ]
    stack.push(...next.toReversed())
  }
  const firstFound = (unit: string[]) => Math.min(...unit.map((id) => found.get(id)!))

  const generations = [...new Set(nodes.map((node) => node.generation))].toSorted((a, b) => b - a)
  const rows = generations.map((generation) =>
    units(
      nodes.filter((node) => node.generation === generation),
      partners,
    ).toSorted((a, b) => firstFound(a) - firstFound(b)),
  )

  // Then each row by where its people's parents (going down) or children (going up) are.
  const x = new Map<string, number>()
  const here = (unit: string[]) => mean(unit.map((id) => x.get(id) ?? 0))
  rows.forEach((row) => packTight(row, x))
  const near =
    (...relatives: Map<string, string[]>[]) =>
    (unit: string[]) => {
      // Each relative once: a couple's child pulls the couple once, not once per parent.
      const placed = new Set(
        unit.flatMap((id) => relatives.flatMap((of) => of.get(id) ?? [])).filter((id) => x.has(id)),
      )
      return placed.size ? mean([...placed].map((id) => x.get(id)!)) : here(unit)
    }
  // How far a unit's people are from their relatives (parents or children), laid out from
  // `start` in this order.
  const awayFrom = (relatives: Map<string, string[]>) => (unit: string[], start: number) =>
    unit.reduce((sum, id, i) => {
      const placed = (relatives.get(id) ?? []).filter((other) => x.has(other))
      if (!placed.length) return sum
      return sum + Math.abs(start + i * NODE_WIDTH - mean(placed.map((other) => x.get(other)!)))
    }, 0)
  const down = rows.map((_, i) => i)
  // Sweeps can make things worse again: keep the best order seen, by crossing lines first,
  // then by how far children are from their parents.
  const parentLines = [...parentsOf].flatMap(([child, parents]) =>
    parents.map((parent) => [parent, child] as const),
  )
  const score = () => {
    let crossings = 0
    for (let a = 0; a < parentLines.length; a++) {
      for (let b = a + 1; b < parentLines.length; b++) {
        const [pa, ca] = parentLines[a].map((id) => x.get(id)!)
        const [pb, cb] = parentLines[b].map((id) => x.get(id)!)
        if ((pa - pb) * (ca - cb) < 0) crossings++
      }
    }
    const distance = parentLines.reduce((sum, [p, c]) => sum + Math.abs(x.get(p)! - x.get(c)!), 0)
    return crossings * NODE_WIDTH * parentLines.length + distance
  }
  let best = { score: score(), rows: rows.map((row) => row.map((unit) => [...unit])) }
  for (let i = 0; i < SWEEPS; i++) {
    const relatives = i % 2 ? childrenOf : parentsOf
    const key = near(relatives)
    const away = awayFrom(relatives)
    for (const r of i % 2 ? down.toReversed() : down) {
      const ranked = rows[r].map((unit, at) => ({ unit, at, wants: key(unit) }))
      rows[r] = ranked.toSorted((a, b) => a.wants - b.wants || a.at - b.at).map(({ unit }) => unit)
      packTight(rows[r], x)
      // Partners face their own families: Mateo, Ela | Can rather than Ela, Mateo | Can.
      rows[r] = rows[r].map((unit) => {
        const start = x.get(unit[0])!
        return away(unit.toReversed(), start) < away(unit, start) ? unit.toReversed() : unit
      })
      packTight(rows[r], x)
    }
    const now = score()
    if (now < best.score)
      best = { score: now, rows: rows.map((row) => row.map((unit) => [...unit])) }
  }
  best.rows.forEach((row, r) => {
    rows[r] = row
    packTight(row, x)
  })

  // Then place them: under their parents, or (with none shown, like the oldest generation
  // and slots) over their children, as far as the row allows.
  const byParents = near(parentsOf)
  const byOthers = near(childrenOf, direct)
  const underParents = (unit: string[]) =>
    unit.some((id) => parentsOf.get(id)?.some((parent) => x.has(parent)))
      ? byParents(unit)
      : byOthers(unit)
  for (let i = 0; i < PLACE_ROUNDS; i++) {
    for (const r of i % 2 ? down.toReversed() : down) place(rows[r], x, underParents)
  }

  // Whole pixels: the steps between people are whole, so spacing stays exact.
  for (const [id, at] of x) x.set(id, Math.round(at))
  const left = Math.min(...x.values()) - NODE_WIDTH / 2
  const rowY = new Map(generations.map((generation, i) => [generation, (i + 0.5) * ROW_HEIGHT]))
  const at = (id: string, generation: number): [number, number] => [
    x.get(id)! - left,
    rowY.get(generation)!,
  ]
  const generationOf = new Map(nodes.map((node) => [node.id, node.generation]))
  const point = (id: string) => at(id, generationOf.get(id)!)

  const lines: TreeLine[] = []
  for (const link of links) {
    if (link.type === 'partner') {
      const [a, b] = [link.source, link.target].toSorted((p, q) => x.get(p)! - x.get(q)!)
      lines.push({
        id: `partner:${a}:${b}`,
        kind: 'partner',
        points: [point(a), point(b)],
        label: link.former ? 'former' : 'partner',
        dashed: link.former,
        dotted: false,
      })
    } else if (link.type !== 'parent') {
      lines.push({
        id: `other:${link.source}:${link.target}`,
        kind: 'other',
        points: [point(link.source), point(link.target)],
        dashed: false,
        dotted: true,
      })
    }
  }
  for (const child of people) {
    const parentLinks = links.filter((l) => l.type === 'parent' && l.target === child.id)
    // A couple with the same kind of link to the child shares one line, from between them.
    const remaining = [...parentLinks]
    while (remaining.length) {
      const first = remaining.shift()!
      const pairAt = remaining.findIndex(
        (other) =>
          other.parent_type === first.parent_type &&
          partners.get(first.source)?.has(other.source) &&
          generationOf.get(other.source) === generationOf.get(first.source),
      )
      const parents =
        pairAt >= 0 ? [first.source, remaining.splice(pairAt, 1)[0].source] : [first.source]
      const [px, py] =
        parents.length === 2 ? midpoint(point(parents[0]), point(parents[1])) : point(first.source)
      lines.push({
        id: `child:${parents.toSorted().join('+')}:${child.id}`,
        kind: 'child',
        points: [[px, py], point(child.id)],
        label: LINE_LABELS[first.parent_type ?? ''],
        dashed: false,
        dotted: false,
      })
    }
  }
  for (const slot of slots) {
    lines.push({
      id: `slot:${slot.key}`,
      kind: 'slot',
      points: [point(`slot:${slot.key}`), point(slot.childId)],
      dashed: true,
      dotted: false,
    })
  }

  const right = Math.max(...x.values()) - left + NODE_WIDTH / 2
  return {
    people: people.map((person) => {
      const [px, py] = point(person.id)
      return { person, x: px, y: py }
    }),
    slots: slots.map(({ key, childId, childName }) => {
      const [px, py] = point(`slot:${key}`)
      return { key, childId, childName, x: px, y: py }
    }),
    lines,
    rows: generations.map((generation) => ({
      generation,
      y: rowY.get(generation)!,
      label: rowLabel(generation, root?.name ?? '', root?.is_me ?? false),
    })),
    width: right,
    height: generations.length * ROW_HEIGHT,
    ...generationSpan(people),
  }
}

function midpoint(a: [number, number], b: [number, number]): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
}
