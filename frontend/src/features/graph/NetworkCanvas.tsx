import { forwardRef, useMemo, useState } from 'react'
import { GraphCanvas, type GraphCanvasRef, type Theme } from 'reagraph'
// Instrument Sans (OFL, fonts/OFL.txt), Latin and Latin Extended merged into one .woff
// at weight 500: the canvas can't use .woff2. Without a font of our own, the labels
// would fetch fonts from a CDN, which a self-hosted notebook mustn't do.
import labelFontUrl from './fonts/instrument-sans-500.woff?url'
import { labelLinesOf, linesAround, type CanvasEdge, type CanvasNode } from './graphModel'
import type { CanvasColors } from './usePalette'

type NetworkCanvasProps = {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  colors: CanvasColors
  selected: string | null
  onSelect: (personId: string | null) => void
  onFocus: (personId: string) => void
}

// Room between people, so names don't overlap (Reagraph's defaults: 50 and -250).
const SPACING = { linkDistance: 110, nodeStrength: -600 }

/**
 * The network on a WebGL canvas (Reagraph), styled after the graph kit (screen 3a):
 * nodes in their space's color, clustered by space, ink lines (former ones dashed),
 * and the selected person ringed in accent. The relationship words show on the lines
 * of whoever is hovered or selected.
 */
export const NetworkCanvas = forwardRef<GraphCanvasRef, NetworkCanvasProps>(function NetworkCanvas(
  { nodes, edges, colors, selected, onSelect, onFocus },
  ref,
) {
  const theme = useMemo(() => canvasTheme(colors), [colors])
  const [hovered, setHovered] = useState<string | null>(null)
  const inFocus = hovered ?? selected
  const shownEdges = useMemo(() => labelLinesOf(edges, inFocus), [edges, inFocus])
  // Lit up, so their words stay readable while everything else fades.
  const actives = useMemo(() => linesAround(edges, inFocus), [edges, inFocus])
  return (
    // Reagraph fills the nearest positioned box; without this one it would take the page.
    <div className="relative size-full">
      <GraphCanvas
        ref={ref}
        nodes={nodes}
        edges={shownEdges}
        theme={theme}
        layoutType="forceDirected2d"
        layoutOverrides={SPACING}
        clusterAttribute="cluster"
        labelFontUrl={labelFontUrl}
        edgeArrowPosition="none"
        edgeLabelPosition="above"
        labelType="all" // every name; lines only have words for the person in focus
        selections={selected ? [selected] : []}
        actives={actives}
        onNodeClick={(node) => onSelect(node.id)}
        onNodeDoubleClick={(node) => onFocus(node.id)}
        onNodePointerOver={(node) => setHovered(node.id)}
        onNodePointerOut={() => setHovered(null)}
        onCanvasClick={() => onSelect(null)}
      />
    </div>
  )
})

function canvasTheme({ paper, ink, accent, palette }: CanvasColors): Theme {
  return {
    canvas: { background: paper },
    node: {
      fill: ink,
      activeFill: accent,
      opacity: 1,
      selectedOpacity: 1,
      inactiveOpacity: 0.2,
      label: { color: ink, stroke: paper, activeColor: accent },
    },
    ring: { fill: ink, activeFill: accent },
    edge: {
      fill: ink,
      activeFill: accent,
      opacity: 0.34,
      selectedOpacity: 1,
      inactiveOpacity: 0.1,
      label: { color: ink, stroke: paper, activeColor: accent, fontSize: 6 },
    },
    arrow: { fill: ink, activeFill: accent },
    lasso: { border: `1px solid ${accent}`, background: 'transparent' },
    cluster: {
      stroke: palette.noSpace, // faint, so the people stand out
      opacity: 0.55,
      selectedOpacity: 1,
      inactiveOpacity: 0.1,
      label: { color: ink, stroke: paper },
    },
  }
}
