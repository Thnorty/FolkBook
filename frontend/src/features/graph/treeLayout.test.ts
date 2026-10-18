import { describe, expect, it } from 'vitest'
import { ELAS_TREE, directLink, parentLink, partnerLink, step, treePerson } from '@/test/familyTree'
import {
  NODE_WIDTH,
  layoutTree,
  rowLabel,
  shownPeople,
  type TreeData,
  type TreeLayout,
} from './treeLayout'

const ALL = { formerPartners: true, inLaws: true }

const xOf = (layout: TreeLayout, id: string) => {
  const placed = layout.people.find((p) => p.person.id === id)
  if (!placed) throw new Error(`${id} isn't placed`)
  return placed.x
}
const yOf = (layout: TreeLayout, id: string) => layout.people.find((p) => p.person.id === id)!.y

function noOverlaps(layout: TreeLayout) {
  const rows = new Map<number, number[]>()
  for (const { x, y } of [...layout.people, ...layout.slots]) {
    rows.set(y, [...(rows.get(y) ?? []), x])
  }
  for (const xs of rows.values()) {
    const sorted = xs.toSorted((a, b) => a - b)
    sorted.slice(1).forEach((x, i) => expect(x - sorted[i]).toBeGreaterThanOrEqual(NODE_WIDTH))
  }
}

describe('rowLabel', () => {
  it.each([
    [2, 'Grandparents'],
    [1, 'Parents'],
    [-1, 'Children'],
    [-2, 'Grandchildren'],
    [3, 'Great-grandparents'],
    [-3, 'Great-grandchildren'],
    [4, '4 generations up'],
    [-4, '4 generations down'],
  ])('generation %i is %s', (generation, label) => {
    expect(rowLabel(generation, 'Ela Demir', true)).toBe(label)
  })

  it("names the tree's own generation", () => {
    expect(rowLabel(0, 'Ela Demir', true)).toBe('Your generation')
    expect(rowLabel(0, 'Nilgün Aksoy', false)).toBe("Nilgün's generation")
  })
})

describe('shownPeople', () => {
  const tree: TreeData = {
    root: 'r',
    people: [
      treePerson('r', 'R', 0),
      treePerson('law', 'In Law', 0, [step('sibling_in_law')], { in_law: true }),
      treePerson('ex', 'Ex', 0, [step('partner', null, { former: true })], { via_former: true }),
    ],
    links: [],
  }

  it('hides in-laws and people only there through an ex, on request', () => {
    const ids = (toggles: typeof ALL) => shownPeople(tree, toggles).map((p) => p.id)
    expect(ids(ALL)).toEqual(['r', 'law', 'ex'])
    expect(ids({ formerPartners: true, inLaws: false })).toEqual(['r', 'ex'])
    expect(ids({ formerPartners: false, inLaws: true })).toEqual(['r', 'law'])
  })
})

describe('layoutTree', () => {
  const layout = layoutTree(ELAS_TREE, ALL)

  it('places everyone once, in rows by generation', () => {
    expect(layout.people.map((p) => p.person.id).toSorted()).toEqual(
      ELAS_TREE.people.map((p) => p.id).toSorted(),
    )
    expect(yOf(layout, 'orhan')).toBeLessThan(yOf(layout, 'murat'))
    expect(yOf(layout, 'murat')).toBeLessThan(yOf(layout, 'ela'))
    expect(yOf(layout, 'ela')).toBeLessThan(yOf(layout, 'lina'))
    expect(yOf(layout, 'ela')).toBe(yOf(layout, 'zeynep'))
    expect(layout.rows.map((row) => row.generation)).toEqual([3, 2, 1, 0, -1])
    expect([layout.up, layout.down]).toEqual([2, 1])
  })

  it('never overlaps two people', () => noOverlaps(layout))

  it('keeps partners next to each other', () => {
    for (const [a, b] of [
      ['ela', 'mateo'],
      ['can', 'zeynep'],
      ['orhan', 'leyla'],
      ['nilgun', 'hakan'],
      ['murat', 'nilgun'],
    ]) {
      expect(Math.abs(xOf(layout, a) - xOf(layout, b))).toBe(NODE_WIDTH)
    }
  })

  it('puts children under their parents', () => {
    for (const [child, parents] of [
      ['ela', ['murat', 'nilgun']],
      ['lina', ['ela', 'mateo']],
      ['emir', ['can', 'zeynep']],
      ['murat', ['orhan', 'leyla']],
    ] as const) {
      const xs = parents.map((id) => xOf(layout, id))
      expect(xOf(layout, child)).toBeGreaterThanOrEqual(Math.min(...xs) - NODE_WIDTH)
      expect(xOf(layout, child)).toBeLessThanOrEqual(Math.max(...xs) + NODE_WIDTH)
    }
  })

  it('draws a couple’s children from between them, and labels step and adoptive links', () => {
    const toLina = layout.lines.filter((l) => l.kind === 'child' && l.id.endsWith(':lina'))
    expect(toLina).toHaveLength(1)
    expect(toLina[0].points[0][0]).toBe((xOf(layout, 'ela') + xOf(layout, 'mateo')) / 2)
    expect(toLina[0].label).toBeUndefined()

    const toEmir = layout.lines.filter((l) => l.kind === 'child' && l.id.endsWith(':emir'))
    expect(toEmir.map((l) => l.label)).toEqual(['adopted'])

    const toEla = layout.lines.filter((l) => l.kind === 'child' && l.id.endsWith(':ela'))
    expect(toEla.map((l) => l.label).toSorted()).toEqual(['step', undefined])
  })

  it('dashes former partners', () => {
    const partners = layout.lines.filter((l) => l.kind === 'partner')
    const former = partners.filter((l) => l.dashed)
    expect(former).toHaveLength(1)
    expect(former[0].label).toBe('former')
    expect(partners.filter((l) => !l.dashed).every((l) => l.label === 'partner')).toBe(true)
  })

  it('has a slot for each missing parent, in the row above', () => {
    const nilguns = layout.slots.filter((s) => s.childId === 'nilgun')
    expect(nilguns).toHaveLength(2)
    expect(nilguns.every((s) => s.childName === 'Nilgün Aksoy')).toBe(true)
    expect(nilguns.every((s) => s.y === yOf(layout, 'orhan'))).toBe(true)
    expect(layout.slots.filter((s) => s.childId === 'orhan')).toHaveLength(2)
    expect(layout.lines.filter((l) => l.kind === 'slot')).toHaveLength(layout.slots.length)
  })

  it('gives the same layout for the same tree', () => {
    expect(layoutTree(ELAS_TREE, ALL)).toEqual(layout)
  })

  it('draws a direct link dotted', () => {
    const tree: TreeData = {
      root: 'r',
      people: [treePerson('r', 'R', 0), treePerson('c', 'C', 0, [step('cousin')])],
      links: [directLink('cousin', 'r', 'c')],
    }
    const lines = layoutTree(tree, ALL).lines
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ kind: 'other', dotted: true })
  })

  it('draws a link stored twice once', () => {
    const tree: TreeData = {
      root: 'r',
      people: [treePerson('r', 'R', 0), treePerson('p', 'P', 0, [step('partner')])],
      links: [partnerLink('r', 'p'), partnerLink('r', 'p')],
    }
    expect(layoutTree(tree, ALL).lines).toHaveLength(1)
  })

  it('starts a child’s line at the parent still shown when the other is hidden', () => {
    const tree: TreeData = {
      root: 'r',
      people: [
        treePerson('r', 'R', 0),
        treePerson('x', 'X', 0, [step('partner', null, { former: true })], { via_former: true }),
        treePerson('k', 'K', -1, [step('child')]),
      ],
      links: [partnerLink('r', 'x', true), parentLink('r', 'k'), parentLink('x', 'k')],
    }
    const hidden = layoutTree(tree, { formerPartners: false, inLaws: true })
    const toK = hidden.lines.filter((l) => l.kind === 'child')
    expect(toK).toHaveLength(1)
    expect(toK[0].points[0][0]).toBe(xOf(hidden, 'r'))
    expect(hidden.lines.some((l) => l.id.includes('x'))).toBe(false)
  })

  it('fits a wide row without overlaps', () => {
    const siblings = Array.from({ length: 12 }, (_, i) => `s${i}`)
    const tree: TreeData = {
      root: 'r',
      people: [
        treePerson('m', 'M', 1, [step('parent')]),
        treePerson('r', 'R', 0),
        ...siblings.flatMap((id) => [
          treePerson(id, `Sib ${id}`, 0, [step('sibling')]),
          treePerson(`${id}p`, `Partner ${id}`, 0, [step('sibling_in_law')], { in_law: true }),
        ]),
      ],
      links: [
        parentLink('m', 'r'),
        ...siblings.flatMap((id) => [parentLink('m', id), partnerLink(id, `${id}p`)]),
      ],
    }
    const wide = layoutTree(tree, ALL)
    noOverlaps(wide)
    expect(wide.width).toBeGreaterThanOrEqual(25 * NODE_WIDTH)
  })

  it('still places people whose links disagree with their generations', () => {
    const tree: TreeData = {
      root: 'a',
      people: [treePerson('a', 'A', 0), treePerson('b', 'B', -1, [step('child')])],
      links: [parentLink('a', 'b'), parentLink('b', 'a'), partnerLink('a', 'b')],
    }
    const odd = layoutTree(tree, ALL)
    expect(odd.people).toHaveLength(2)
    noOverlaps(odd)
  })
})
