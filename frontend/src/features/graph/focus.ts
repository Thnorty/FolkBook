import type { GraphData } from './graphModel'

export type FocusCounts = { direct: number; further: number; hidden: number }

/**
 * Who focus mode shows around someone, and who it hides: everyone but them is counted,
 * your Me too (it's drawn like anyone else here). One step means any link or shared space,
 * the same steps the neighborhood was found by.
 */
export function focusCounts(
  neighborhood: GraphData,
  graph: GraphData,
  personId: string,
): FocusCounts {
  const shown = new Set(neighborhood.nodes.map((node) => node.id))
  const direct = new Set<string>()
  for (const edge of neighborhood.edges) {
    if (edge.source === personId) direct.add(edge.target)
    if (edge.target === personId) direct.add(edge.source)
  }
  direct.delete(personId)
  return {
    direct: direct.size,
    further: shown.size - 1 - direct.size,
    hidden: graph.nodes.filter((node) => !shown.has(node.id) && node.id !== personId).length,
  }
}

/** "8 direct · 5 more at 2 steps · 135 others hidden". */
export function focusLine({ direct, further, hidden }: FocusCounts, hops: 1 | 2): string {
  return [
    `${direct} direct`,
    hops === 2 && `${further} more at 2 steps`,
    hidden > 0 && `${hidden} ${hidden === 1 ? 'other' : 'others'} hidden`,
  ]
    .filter(Boolean)
    .join(' · ')
}
