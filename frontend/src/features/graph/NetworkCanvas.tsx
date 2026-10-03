import { useThree } from '@react-three/fiber'
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import {
  GraphCanvas,
  Label,
  type ClusterRendererProps,
  type GraphCanvasRef,
  type Theme,
} from 'reagraph'
import { configureTextBuilder } from 'troika-three-text'
// Instrument Sans (OFL, fonts/OFL.txt), Latin and Latin Extended merged into one .woff
// at weight 500: the canvas can't use .woff2. Characters it lacks come from our own
// fallback fonts (fallbackFonts.ts); left alone, the text library would fetch them from a
// CDN, which a self-hosted notebook mustn't do.
import labelFontUrl from './fonts/instrument-sans-500.woff?url'
import { fallbackFontsUrl } from './fallbackFonts'
import {
  labelLinesOf,
  linesAround,
  type CanvasEdge,
  type CanvasNode,
  type ClusterColors,
  type Focus,
} from './graphModel'
import { widenLineReach } from './lineReach'
import type { CanvasColors } from './usePalette'

// Before the first label is drawn: later calls are ignored.
configureTextBuilder({ unicodeFontsURL: fallbackFontsUrl() })

type NetworkCanvasProps = {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  /** Each space's ring and name colors, by the space's name. */
  clusters: ClusterColors
  colors: CanvasColors
  selected: string | null
  onSelect: (personId: string | null) => void
}

// Room between people, so names don't overlap (Reagraph's defaults: 50 and -250).
const SPACING = { linkDistance: 110, nodeStrength: -600 }

/**
 * The network on a WebGL canvas (Reagraph), styled after the graph kit (screen 3a):
 * nodes in their space's color, clustered by space, ink lines (former ones dashed),
 * and the selected person ringed in accent. A line's words show when you point at it
 * or tap it, or at one of its people.
 */
export const NetworkCanvas = forwardRef<GraphCanvasRef, NetworkCanvasProps>(function NetworkCanvas(
  { nodes, edges, clusters, colors, selected, onSelect },
  ref,
) {
  const theme = useMemo(() => canvasTheme(colors), [colors])
  const renderCluster = useMemo(() => spaceRing(clusters, colors), [clusters, colors])
  const [hovered, setHovered] = useState<string | null>(null)
  const pointed = usePointedLine()
  // A tapped line keeps its words (phones can't point).
  const [pickedLine, setPickedLine] = useState<string | null>(null)
  const inFocus = useMemo<Focus>(() => {
    const person = hovered
    const line = pointed.line ?? pickedLine
    if (person) return { person }
    if (line) return { line }
    return selected ? { person: selected } : null
  }, [hovered, pointed.line, pickedLine, selected])
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
        // Drawn where the layout ends up: animated, the lines swing round as people
        // fly out from the middle.
        animated={false}
        clusterAttribute="cluster"
        onRenderCluster={renderCluster}
        labelFontUrl={labelFontUrl}
        edgeArrowPosition="none"
        edgeLabelPosition="above"
        labelType="all" // every name; lines only have words for the person in focus
        selections={selected ? [selected] : []}
        actives={actives}
        onNodeClick={(node) => {
          setPickedLine(null)
          onSelect(node.id)
        }}
        onNodePointerOver={(node) => setHovered(node.id)}
        onNodePointerOut={() => setHovered(null)}
        onEdgeClick={(edge) => setPickedLine(edge.id)}
        onEdgePointerOver={pointed.over}
        onEdgePointerOut={pointed.out}
        onCanvasClick={() => {
          // A click near a line, not quite on it, still picks it.
          setPickedLine(pointed.line)
          if (!pointed.line) onSelect(null)
        }}
      >
        <WideLineReach />
      </GraphCanvas>
    </div>
  )
})

/** Inside the canvas: lines can be pointed at from a few pixels away. */
function WideLineReach() {
  const raycaster = useThree((state) => state.raycaster)
  const get = useThree((state) => state.get)
  useEffect(
    () =>
      widenLineReach(raycaster, () => {
        const { camera, size } = get()
        return { camera, heightPx: size.height }
      }),
    [raycaster, get],
  )
  return null
}

/**
 * The line under the pointer. Reagraph checks every frame and tells lines apart as
 * objects: a line that gets its words is a new object, so "left the old line" follows
 * "entered the new one". Keeping the objects makes that harmless; with lines on top of
 * each other, the last one entered wins.
 */
function usePointedLine() {
  const under = useRef(new Set<{ id: string }>())
  const [line, setLine] = useState<string | null>(null)
  const update = () => setLine([...under.current].at(-1)?.id ?? null)
  return {
    line,
    over(edge: { id: string }) {
      under.current.add(edge)
      update()
    },
    out(edge: { id: string }) {
      under.current.delete(edge)
      update()
    },
  }
}

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

/**
 * A space's ring and name in the space's own colors (Reagraph's own ring has one color
 * for all). Same shape as Reagraph's: a band just outside the people, the name below.
 */
function spaceRing(clusters: ClusterColors, { ink, paper }: CanvasColors) {
  return function SpaceRing({
    label,
    opacity,
    outerRadius,
    innerRadius,
    padding,
  }: ClusterRendererProps) {
    const color = label && clusters[label.text]
    return (
      <>
        <mesh>
          <ringGeometry args={[outerRadius, innerRadius + padding, 128]} />
          <meshBasicMaterial
            color={color ? color.ring : ink}
            transparent
            depthTest={false}
            opacity={opacity}
          />
        </mesh>
        {label && (
          <group position={label.position}>
            <Label
              text={label.text}
              fontUrl={label.fontUrl}
              fontSize={12}
              color={color ? color.label : ink}
              stroke={paper}
              opacity={opacity}
            />
          </group>
        )}
      </>
    )
  }
}
