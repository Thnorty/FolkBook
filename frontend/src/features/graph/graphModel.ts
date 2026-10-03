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
  /** Lines that only say someone is in a space (no relationship): faint, in the back. */
  spaceEdge: string
  space: Record<SpaceColor, string>
  /** Each space's darker shade, readable as text (its name on the ring). */
  spaceInk: Record<SpaceColor, string>
}

/** A space's ring around its people, in the space's colors. */
export type ClusterColors = Record<string, { ring: string; label: string }>

export type CanvasNode = {
  id: string
  label: string
  fill: string
  icon?: string
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

/**
 * What a line says: "friend", "met at Hackathon", "former partner"; a line that only
 * means someone is in a space says which ("in Hackathon", "shares Hackathon").
 */
function edgeLabel(edge: ApiEdge): string | undefined {
  if (edge.kind === 'space') return edge.space ? `in ${edge.space.name}` : undefined
  if (edge.kind === 'member') return edge.space ? `shares ${edge.space.name}` : undefined
  if (!edge.type) return undefined
  const label = linkLabel({ type: edge.type, label: edge.label })
  return edge.former ? `former ${label}` : label
}

/** A person's color: their first space's, ink for you, faint without a space. */
export function nodeFill(node: ApiNode, palette: Palette): string {
  if (node.is_me) return palette.me
  return node.spaces[0] ? palette.space[node.spaces[0].color] : palette.noSpace
}

export function toCanvas(
  graph: GraphData,
  filters: Filters,
  palette: Palette,
  /** Drawn faces by id (photo or initials); without one a node is a plain dot. */
  faces: Record<string, string> = {},
) {
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

  // People are grouped by their first space's name; its ring takes that space's colors.
  const clusters: ClusterColors = {}
  for (const node of nodes) {
    const space = node.spaces[0]
    if (!node.is_me && space && !clusters[space.name]) {
      clusters[space.name] = {
        ring: palette.space[space.color],
        label: palette.spaceInk[space.color],
      }
    }
  }

  return {
    clusters,
    nodes: nodes.map((node): CanvasNode => ({
      id: node.id,
      label: node.is_me ? 'Me' : node.name,
      fill: nodeFill(node, palette),
      icon: faces[node.id],
      ...(node.is_me && { fx: 0, fy: 0 }),
      data: { cluster: node.is_me ? null : (node.spaces[0]?.name ?? null), isMe: node.is_me },
    })),
    edges: edges.map((edge): CanvasEdge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edgeLabel(edge),
      dashed: edge.former,
      fill: edge.kind === 'relationship' ? palette.edge : palette.spaceEdge,
    })),
  }
}

/** What the graph is about right now: a person or a line, hovered or picked. */
export type Focus = { person: string } | { line: string } | null

function linesOf(edges: CanvasEdge[], focus: Focus): CanvasEdge[] {
  if (!focus) return []
  if ('line' in focus) return edges.filter((edge) => edge.id === focus.line)
  return edges.filter((edge) => edge.source === focus.person || edge.target === focus.person)
}

/**
 * Words only on the lines in focus (a person's, or the one line): written on every
 * line, they pile up on each other and on the names.
 */
export function labelLinesOf(edges: CanvasEdge[], focus: Focus): CanvasEdge[] {
  const labelled = new Set(linesOf(edges, focus).map((edge) => edge.id))
  return edges.map((edge) => (labelled.has(edge.id) ? edge : { ...edge, label: undefined }))
}

/** The lines in focus and the people at their ends, to light up. */
export function linesAround(edges: CanvasEdge[], focus: Focus): string[] {
  const lines = linesOf(edges, focus)
  const people = new Set(focus && 'person' in focus ? [focus.person] : [])
  for (const edge of lines) people.add(edge.source).add(edge.target)
  return [...people, ...lines.map((edge) => edge.id)]
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
