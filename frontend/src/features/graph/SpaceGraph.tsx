import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useNodeFaces } from './faces'
import { NO_FILTERS, toCanvas } from './graphModel'
import { NetworkCanvas } from './NetworkCanvas'
import { graphQuery } from './queries'
import { useCanvasColors } from './usePalette'

/** "In the graph" on a space's page (screen 4b): its people and how they're connected. */
export default function SpaceGraph({ spaceId }: { spaceId: string }) {
  const navigate = useNavigate()
  const graph = useQuery(graphQuery).data
  const colors = useCanvasColors()
  const faces = useNodeFaces(graph?.nodes, colors)
  const drawn = useMemo(
    () => graph && toCanvas(graph, { ...NO_FILTERS, spaces: [spaceId] }, colors.palette, faces),
    [graph, spaceId, colors.palette, faces],
  )
  // Just you: nothing worth drawing yet.
  if (!drawn || drawn.nodes.length < 2) return null

  return (
    <section aria-label="In the graph" className="flex flex-col gap-2">
      <h2 className="type-label text-ink-faint">In the graph</h2>
      <div className="relative h-64 overflow-hidden rounded-card border border-line bg-paper">
        <NetworkCanvas
          nodes={drawn.nodes}
          edges={drawn.edges}
          colors={colors}
          selected={null}
          onSelect={(personId) =>
            personId && void navigate({ to: '/people/$personId', params: { personId } })
          }
        />
      </div>
    </section>
  )
}
