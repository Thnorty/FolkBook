import type { GraphData } from './graphModel'

/* Big notebooks (screen 3j): the network starts with you and everyone two steps away;
   everyone further is folded into one bubble per space, which unfolds on click. Plain
   data in and out, so it's tested without drawing anything. */

/** Above this many people (besides you), faraway spaces are folded. */
export const FOLD_ABOVE = 300
/** How far "near" reaches, in drawn lines. */
const NEAR_STEPS = 2

type Node = GraphData['nodes'][number]
export type SpaceRef = Node['spaces'][number]

/** A folded space: `direct` is how many near people have lines into it. */
export type Bubble = { id: string; space: SpaceRef | null; count: number; direct: number }
/** A shown person's lines into a bubble, drawn as one. */
export type BubbleLine = { id: string; source: string; target: string; count: number }
export type Folded = {
  /** The shown people and the lines between them. */
  graph: GraphData
  bubbles: Bubble[]
  lines: BubbleLine[]
  /** People other than you, as the graph's header counts them. */
  shown: number
  total: number
}

export const bubbleId = (spaceId: string | null) => `fold:${spaceId ?? 'none'}`
export const isBubble = (id: string) => id.startsWith('fold:')
/** The space a bubble holds: its id, or 'none' for people in no space. */
export const spaceOfBubble = (id: string) => id.slice('fold:'.length)
/** What a bubble is called: its space's name. */
export const bubbleName = (bubble: Pick<Bubble, 'space'>) =>
  bubble.space?.name ?? 'Not in any space'

/** The space someone is folded into: their first (the one that colours them). */
const firstSpace = (node: Node) => node.spaces[0] ?? null

export function foldGraph(
  graph: GraphData,
  {
    unfolded,
    keep,
    spaces = new Set(),
  }: {
    /** Spaces shown in full (space ids; 'none' for people in no space). */
    unfolded: ReadonlySet<string>
    /** People shown whatever happens: a route's. */
    keep: ReadonlySet<string>
    /** Spaces picked in the filters: everyone in them shows, whatever their first space. */
    spaces?: ReadonlySet<string>
  },
): Folded {
  // Being in someone's space isn't a step: only lines that are drawn count.
  const lines = graph.edges.filter((edge) => edge.kind !== 'space')
  const neighbours = new Map<string, string[]>()
  for (const { source, target } of lines) {
    neighbours.set(source, [...(neighbours.get(source) ?? []), target])
    neighbours.set(target, [...(neighbours.get(target) ?? []), source])
  }
  const me = graph.nodes.find((node) => node.is_me)
  const near = new Set(me ? [me.id] : [])
  let edge = [...near]
  for (let step = 0; step < NEAR_STEPS; step++) {
    edge = edge.flatMap((id) => neighbours.get(id) ?? []).filter((id) => !near.has(id))
    edge.forEach((id) => near.add(id))
  }

  const isShown = (node: Node) =>
    near.has(node.id) ||
    keep.has(node.id) ||
    unfolded.has(firstSpace(node)?.id ?? 'none') ||
    node.spaces.some((space) => spaces.has(space.id))
  const shownNodes = graph.nodes.filter(isShown)
  const shown = new Set(shownNodes.map((node) => node.id))

  const bubbleOf = new Map<string, string>()
  const bubbles = new Map<string, Bubble>()
  for (const node of graph.nodes) {
    if (shown.has(node.id)) continue
    const space = firstSpace(node)
    const id = bubbleId(space?.id ?? null)
    bubbleOf.set(node.id, id)
    const bubble = bubbles.get(id) ?? { id, space, count: 0, direct: 0 }
    bubbles.set(id, { ...bubble, count: bubble.count + 1 })
  }

  const into = new Map<string, BubbleLine>()
  for (const { source, target } of lines) {
    for (const [from, to] of [
      [source, target],
      [target, source],
    ]) {
      const bubble = bubbleOf.get(to)
      if (!shown.has(from) || !bubble) continue
      const id = `fold:${from}:${bubble}`
      const line = into.get(id) ?? { id, source: from, target: bubble, count: 0 }
      into.set(id, { ...line, count: line.count + 1 })
    }
  }
  // "You know 3 directly": the near people with lines in, not everyone unfolded.
  for (const line of [...into.values()].filter((line) => near.has(line.source))) {
    const bubble = bubbles.get(line.target)!
    bubbles.set(line.target, { ...bubble, direct: bubble.direct + 1 })
  }

  return {
    graph: {
      nodes: shownNodes,
      edges: graph.edges.filter((e) => shown.has(e.source) && shown.has(e.target)),
    },
    // Largest first; equal ones in the order their people come.
    bubbles: [...bubbles.values()].toSorted((a, b) => b.count - a.count),
    lines: [...into.values()],
    shown: shownNodes.filter((node) => !node.is_me).length,
    total: graph.nodes.filter((node) => !node.is_me).length,
  }
}
