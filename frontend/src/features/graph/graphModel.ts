import type { components } from '@/api/schema'
import { linkLabel } from '@/features/person/labels'

/*
 * From the API's graph to what the canvas draws (graph kit, screen 3a), with the
 * filters applied. Plain data, so it's tested without WebGL.
 */

export type GraphData = components['schemas']['GraphOut']
type ApiNode = GraphData['nodes'][number]
type ApiEdge = GraphData['edges'][number]
type SpaceColor = ApiNode['spaces'][number]['color']

export type Filters = {
  /** Show only people in these spaces (and you). Empty: everyone. */
  spaces: string[]
  familyOnly: boolean
  hideFormer: boolean
}

export const NO_FILTERS: Filters = { spaces: [], familyOnly: false, hideFormer: false }

const FAMILY = new Set(['parent', 'partner', 'sibling', 'cousin', 'grandparent', 'aunt_uncle'])

/** Colors the canvas needs, resolved from the design tokens for the current theme. */
export type Palette = {
  me: string
  noSpace: string
  edge: string
  space: Record<SpaceColor, string>
}

export type CanvasNode = {
  id: string
  label: string
  fill: string
  /** Me stays in the middle. */
  fx?: number
  fy?: number
  data: { cluster: string | null; isMe: boolean }
}

export type CanvasEdge = {
  id: string
  source: string
  target: string
  label?: string
  dashed?: boolean
  fill: string
}

/** What a link says on its line: "friend", "met at Hackathon", "former partner". */
function edgeLabel(edge: ApiEdge): string | undefined {
  if (edge.kind !== 'relationship' || !edge.type) return undefined
  const label = linkLabel({ type: edge.type, label: edge.label })
  return edge.former ? `former ${label}` : label
}

export function toCanvas(graph: GraphData, filters: Filters, palette: Palette) {
  const keepEdge = (edge: ApiEdge) =>
    !(filters.hideFormer && edge.former) &&
    !(filters.familyOnly && !(edge.kind === 'relationship' && FAMILY.has(edge.type ?? '')))
  const inSpaces = (node: ApiNode) =>
    filters.spaces.length === 0 || node.spaces.some((space) => filters.spaces.includes(space.id))

  let edges = graph.edges.filter(keepEdge)
  // Family only: just the people those lines connect, and you.
  const onFamilyLines = new Set(edges.flatMap((edge) => [edge.source, edge.target]))
  const nodes = graph.nodes.filter(
    (node) => node.is_me || (inSpaces(node) && (!filters.familyOnly || onFamilyLines.has(node.id))),
  )
  const shown = new Set(nodes.map((node) => node.id))
  edges = edges.filter((edge) => shown.has(edge.source) && shown.has(edge.target))

  return {
    nodes: nodes.map((node): CanvasNode => ({
      id: node.id,
      label: node.is_me ? 'Me' : node.name,
      fill: node.is_me
        ? palette.me
        : node.spaces[0]
          ? palette.space[node.spaces[0].color]
          : palette.noSpace,
      ...(node.is_me && { fx: 0, fy: 0 }),
      data: { cluster: node.is_me ? null : (node.spaces[0]?.name ?? null), isMe: node.is_me },
    })),
    edges: edges.map((edge): CanvasEdge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edgeLabel(edge),
      dashed: edge.former,
      fill: palette.edge,
    })),
  }
}

/** "148 people · 231 connections" for the header (you aren't counted). */
export function graphSummary(graph: GraphData) {
  return {
    people: graph.nodes.filter((node) => !node.is_me).length,
    connections: graph.edges.length,
  }
}

/** The spaces that appear in the graph, once each, for the filter chips. */
export function graphSpaces(graph: GraphData) {
  const spaces = new Map<string, ApiNode['spaces'][number]>()
  for (const node of graph.nodes) for (const space of node.spaces) spaces.set(space.id, space)
  return [...spaces.values()].sort((a, b) => a.name.localeCompare(b.name))
}
