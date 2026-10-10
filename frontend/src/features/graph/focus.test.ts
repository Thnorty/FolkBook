import { describe, expect, it } from 'vitest'
import { focusCounts, focusLine } from './focus'
import type { GraphData } from './graphModel'

const node = (id: string) => ({ id, name: id, is_me: id === 'me', spaces: [], photo_url: null })
type Edge = GraphData['edges'][number]
const edge = (
  id: string,
  source: string,
  target: string,
  kind: Edge['kind'] = 'relationship',
): Edge => ({
  id,
  source,
  target,
  kind,
  type: kind === 'relationship' ? 'friend' : null,
  label: '',
  former: false,
  space: null,
})
const graphOf = (ids: string[], edges: Edge[]): GraphData => ({
  nodes: ids.map(node),
  edges: edges.filter((e) => ids.includes(e.source) && ids.includes(e.target)),
})

// me–emma, emma–tom, emma–kerem (they share a space), tom–ola; anna alone.
const EDGES = [
  edge('e1', 'me', 'emma'),
  edge('e2', 'emma', 'tom'),
  edge('m1', 'emma', 'kerem', 'member'),
  edge('e3', 'tom', 'ola'),
]
const GRAPH = graphOf(['me', 'emma', 'tom', 'kerem', 'ola', 'anna'], EDGES)

describe('focusCounts', () => {
  it('counts who is one step away, who is further, and who is hidden', () => {
    const oneStep = graphOf(['me', 'emma', 'tom', 'kerem'], EDGES)
    const twoSteps = graphOf(['me', 'emma', 'tom', 'kerem', 'ola'], EDGES)

    expect(focusCounts(oneStep, GRAPH, 'emma')).toEqual({ direct: 3, further: 0, hidden: 2 })
    expect(focusCounts(twoSteps, GRAPH, 'emma')).toEqual({ direct: 3, further: 1, hidden: 1 })
  })

  it('counts someone once when two lines lead to them', () => {
    const twice = graphOf(['me', 'emma'], [edge('e1', 'me', 'emma'), edge('e9', 'emma', 'me')])

    expect(focusCounts(twice, GRAPH, 'emma').direct).toBe(1)
  })

  it('counts everyone else as hidden around someone with no connections', () => {
    expect(focusCounts(graphOf(['anna'], []), GRAPH, 'anna')).toEqual({
      direct: 0,
      further: 0,
      hidden: 5,
    })
  })
})

describe('focusLine', () => {
  it('says how many are near and how many are hidden', () => {
    expect(focusLine({ direct: 3, further: 0, hidden: 2 }, 1)).toBe('3 direct · 2 others hidden')
    expect(focusLine({ direct: 3, further: 1, hidden: 1 }, 2)).toBe(
      '3 direct · 1 more at 2 steps · 1 other hidden',
    )
    expect(focusLine({ direct: 2, further: 0, hidden: 0 }, 1)).toBe('2 direct')
  })
})
