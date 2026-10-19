import { describe, expect, it } from 'vitest'
import { bubbleId, foldGraph, isBubble } from './fold'
import type { GraphData } from './graphModel'

type Node = GraphData['nodes'][number]
type Edge = GraphData['edges'][number]
type Space = Node['spaces'][number]

const space = (id: string, name: string): Space => ({ id, name, color: 'sage' })
const CLIMBING = space('climbing', 'Climbing club')
const WORK = space('work', 'Work')

const person = (id: string, spaces: Space[] = [], isMe = false): Node => ({
  id,
  name: id,
  is_me: isMe,
  spaces,
  photo_url: null,
})

let count = 0
const edge = (source: string, target: string, kind: Edge['kind'] = 'relationship'): Edge => ({
  id: `e${++count}`,
  source,
  target,
  kind,
  type: kind === 'relationship' ? 'friend' : null,
  label: '',
  former: false,
  space: null,
})

/*
 * me — a — b — c (3 steps: folded) ; me ·· m (member line) — n (2 steps)
 * Climbing club: c, c2, c3 (c2 linked to b, c3 to nobody near) ; Work: w ; no space: z
 * me owns the space everyone in Climbing club is in (space edges, which don't count).
 */
const GRAPH: GraphData = {
  nodes: [
    person('me', [], true),
    person('a'),
    person('b'),
    person('m'),
    person('n'),
    person('c', [CLIMBING]),
    person('c2', [CLIMBING, WORK]),
    person('c3', [CLIMBING]),
    person('w', [WORK]),
    person('z'),
  ],
  edges: [
    edge('me', 'a'),
    edge('a', 'b'),
    edge('b', 'c'),
    edge('b', 'c2'),
    edge('me', 'm', 'member'),
    edge('m', 'n'),
    edge('n', 'w'),
    edge('n', 'z'),
    edge('c', 'c3'),
    edge('me', 'c', 'space'),
    edge('me', 'c2', 'space'),
    edge('me', 'c3', 'space'),
  ],
}

const NONE = new Set<string>()
const ids = (graph: GraphData) => graph.nodes.map((node) => node.id).toSorted()

describe('foldGraph', () => {
  const folded = foldGraph(GRAPH, { unfolded: NONE, keep: NONE })

  it('shows you and everyone two steps along drawn lines', () => {
    expect(ids(folded.graph)).toEqual(['a', 'b', 'm', 'me', 'n'])
    expect([folded.shown, folded.total]).toEqual([5, 10])
  })

  it('folds the rest by their first space, largest first', () => {
    expect(folded.bubbles.map(({ id, count }) => [id, count])).toEqual([
      ['fold:climbing', 3],
      ['fold:work', 1],
      ['fold:none', 1],
    ])
    expect(folded.bubbles[0].space).toEqual(CLIMBING)
    expect(folded.bubbles[2].space).toBeNull()
  })

  it('keeps only the lines between shown people', () => {
    const ends = folded.graph.edges.map((e) => `${e.source}-${e.target}`)
    expect(ends.toSorted()).toEqual(['a-b', 'm-n', 'me-a', 'me-m'])
  })

  it('joins a bubble to each shown person with lines into it', () => {
    expect(folded.lines.map(({ source, target, count }) => [source, target, count])).toEqual(
      expect.arrayContaining([
        ['b', 'fold:climbing', 2],
        ['n', 'fold:work', 1],
        ['n', 'fold:none', 1],
      ]),
    )
    expect(folded.lines).toHaveLength(3)
    expect(folded.lines[0].id).toBe(`fold:${folded.lines[0].source}:${folded.lines[0].target}`)
    expect(folded.bubbles.find((b) => b.id === 'fold:climbing')!.direct).toBe(1)
  })

  it('still shows a bubble nobody near links into', () => {
    const lonely = foldGraph(
      { nodes: [person('me', [], true), person('x', [WORK])], edges: [] },
      { unfolded: NONE, keep: NONE },
    )
    expect(lonely.bubbles.map((b) => b.id)).toEqual(['fold:work'])
    expect(lonely.lines).toEqual([])
  })

  it('unfolds a space: its people and their lines, other bubbles stay', () => {
    const open = foldGraph(GRAPH, { unfolded: new Set(['climbing']), keep: NONE })
    expect(ids(open.graph)).toEqual(['a', 'b', 'c', 'c2', 'c3', 'm', 'me', 'n'])
    expect(open.graph.edges.some((e) => e.source === 'c' && e.target === 'c3')).toBe(true)
    expect(open.bubbles.map((b) => b.id)).toEqual(['fold:work', 'fold:none'])
  })

  it('unfolds the people in no space', () => {
    const open = foldGraph(GRAPH, { unfolded: new Set(['none']), keep: NONE })
    expect(ids(open.graph)).toContain('z')
    expect(open.bubbles.map((b) => b.id)).not.toContain('fold:none')
  })

  it('shows a route’s people, out of their bubble', () => {
    const route = foldGraph(GRAPH, { unfolded: NONE, keep: new Set(['c', 'w']) })
    expect(ids(route.graph)).toEqual(expect.arrayContaining(['c', 'w']))
    expect(route.bubbles.map(({ id, count }) => [id, count])).toEqual([
      ['fold:climbing', 2],
      ['fold:none', 1],
    ])
  })

  it('makes no bubbles when everyone is near', () => {
    const close = foldGraph(
      { nodes: [person('me', [], true), person('a', [WORK])], edges: [edge('me', 'a')] },
      { unfolded: NONE, keep: NONE },
    )
    expect(close.bubbles).toEqual([])
    expect([close.shown, close.total]).toEqual([2, 2])
  })

  it('names bubbles by space', () => {
    expect([bubbleId('work'), bubbleId(null)]).toEqual(['fold:work', 'fold:none'])
    expect([isBubble('fold:work'), isBubble('me')]).toEqual([true, false])
  })
})
