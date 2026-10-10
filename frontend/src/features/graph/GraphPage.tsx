import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Info, Maximize, Minus, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GraphCanvasRef } from 'reagraph'
import { currentUserQuery } from '@/api/session'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { PeekPanel } from '@/features/people/PeekPanel'
import { countOf } from '@/features/person/labels'
import { memoryAidsQuery, personQuery } from '@/features/person/queries'
import { useInteractionForm } from '@/features/person/useInteractionForm'
import { usePersonForm } from '@/features/person/usePersonForm'
import { SHORTCUTS } from '@/app/nav'
import { ApiError } from '@/api/errors'
import { useShortcut } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import {
  graphSpaces,
  graphSummary,
  NO_FILTERS,
  routePeople,
  toCanvas,
  withRoute,
  type Filters,
} from './graphModel'
import { PERSON_GONE } from './copy'
import { focusCounts, focusLine } from './focus'
import { FocusBar } from './FocusBar'
import { HowDoIKnow } from './HowDoIKnow'
import { NetworkCanvas } from './NetworkCanvas'
import { graphQuery, neighborhoodQuery, pathsQuery } from './queries'
import { RouteSummary } from './RouteSummary'
import type { GraphSearch } from './search'
import { useNodeFaces } from './faces'
import { Toggle } from './Toggle'
import { useCanvasColors } from './usePalette'
import { useStepReveal } from './useStepReveal'

/** The network: you in the middle, everyone around, clustered by space (3b–3e, 3m, 3n). */
export function GraphPage() {
  const graph = useQuery(graphQuery)
  // Typed by hand: this page is loaded lazily, so the router's own types can't reach it.
  const { how: asked, focus, hops }: GraphSearch = useSearch({ from: '/app/graph' })
  const navigate = useNavigate({ from: '/graph' })

  // A route to yourself (a typed or stale link) is no route.
  const meId = useQuery(currentUserQuery).data?.me?.id
  const how = asked !== meId ? asked : undefined
  // Which of the routes is drawn: the shortest, again, for each new person.
  const [alternative, setAlternative] = useState({ how, index: 0 })
  // A route and a focus replace each other.
  const showRoute = (personId?: string) => {
    // A route, picked or cleared, starts again from the shortest.
    setAlternative({ how: personId, index: 0 })
    void navigate({ search: personId ? { how: personId } : {} })
  }
  // A new focus starts at 1 step.
  const setFocus = (personId?: string) => {
    // The person already focused keeps their steps.
    const steps = personId === focus && hops ? { hops } : {}
    void navigate({ search: personId ? { focus: personId, ...steps } : {} })
  }
  const setHops = (steps: 1 | 2) =>
    void navigate({ search: { focus, ...(steps === 2 && { hops: 2 as const }) } })
  const focusHops = hops ?? 1
  const focused = useQuery({
    ...neighborhoodQuery(focus ?? '', focusHops),
    enabled: Boolean(focus),
  })
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [picked, setSelected] = useState<string | null>(null)
  // How to read the graph: hidden until asked for.
  const [tip, setTip] = useState(false)
  const colors = useCanvasColors()
  const canvas = useRef<GraphCanvasRef>(null)
  const closePreview = useCallback(() => setSelected(null), [])

  const shownIndex = alternative.how === how ? alternative.index : 0
  const paths = useQuery({ ...pathsQuery(how ?? ''), enabled: Boolean(how) })
  const route = how ? paths.data?.paths[shownIndex] : undefined
  const steps = useStepReveal(route?.hops.length ?? 0, `${how}:${shownIndex}`)

  const shown = (focus && focused.data) || graph.data
  const faces = useNodeFaces(graph.data?.nodes, colors)
  const drawn = useMemo(() => {
    if (!shown) return undefined
    if (!route) {
      // The focused person stays drawn whatever the filters say.
      const keep = new Set(focus ? [focus] : [])
      return { ...toCanvas(shown, filters, colors.palette, faces, keep), route: undefined }
    }
    const keep = new Set(routePeople(route))
    return withRoute(
      toCanvas(shown, filters, colors.palette, faces, keep),
      route,
      steps,
      colors.palette,
    )
  }, [shown, filters, colors.palette, faces, route, steps, focus])
  // Someone no longer drawn (after 2 → 1 step, or a filter) isn't open beside the graph.
  const selected = picked && drawn?.nodes.some((node) => node.id === picked) ? picked : null
  // Esc leaves a route or focus, once an open peek has closed (the peek takes Esc first).
  useShortcut(SHORTCUTS.back, () => showRoute(), {
    enabled: Boolean(how || focus) && !selected,
  })
  // Once drawn, the view frames the route.
  const routeDrawn = route !== undefined && steps === route.hops.length
  useEffect(() => {
    if (route && routeDrawn) canvas.current?.fitNodesInView(routePeople(route))
  }, [route, routeDrawn])
  const summary = graph.data && graphSummary(graph.data)
  const focusName = focus && graph.data?.nodes.find((node) => node.id === focus)?.name
  const focusNote = (() => {
    if (!focus) return null
    if (focused.error instanceof ApiError && focused.error.status === 404) return PERSON_GONE
    if (focused.error) return focused.error.message
    // While another person's or another number of steps' answer loads, the drawing
    // stays, but its numbers would be wrong.
    if (!focused.data || focused.isPlaceholderData || !graph.data) return null
    if (focused.data.nodes.length <= 1) {
      return `Nobody else is connected to ${focusName?.split(' ')[0] ?? 'them'} yet.`
    }
    return focusLine(focusCounts(focused.data, graph.data, focus), focusHops)
  })()

  if (graph.isPending || graph.isError) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        <PageHeader title="Graph" />
        <p className={cn('py-16 text-center', graph.isError ? 'text-danger' : 'text-ink-soft')}>
          {graph.isError ? graph.error.message : 'Drawing your graph…'}
        </p>
      </div>
    )
  }
  if (summary?.people === 0) return <EmptyGraph />

  return (
    // The whole screen: the graph takes all the room under the header and filters
    // (above the bottom tabs on phones, which <main> leaves 7rem for).
    <div
      className={cn(
        'h-[calc(100dvh-7rem)] px-4 pt-6 pb-2 md:h-dvh md:px-8 md:pb-6',
        selected && 'md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] md:gap-6',
      )}
    >
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <PageHeader
          title="Graph"
          meta={
            summary &&
            `${countOf(summary.people, 'person', 'people')} · ${countOf(summary.connections, 'connection')}`
          }
        />
        <div className="mt-4">
          <HowDoIKnow personId={how} meId={meId} onPick={showRoute} onClear={() => showRoute()} />
        </div>
        <FilterBar graph={graph.data} filters={filters} onChange={setFilters} />
        {focus && (
          <FocusBar
            name={focusName}
            hops={focusHops}
            onHops={setHops}
            onBack={() => setFocus()}
            note={focusNote}
          />
        )}
        <div className="relative mt-4 flex min-h-64 flex-1 flex-col overflow-hidden rounded-card border border-line bg-paper">
          {/* With a route on desktop, the graph keeps clear of its card, so the route fits in
              view; on phones the card goes under the graph instead. */}
          <div className={cn('relative min-h-0 flex-1', how && 'md:ml-84')}>
            {drawn && (
              <NetworkCanvas
                ref={canvas}
                nodes={drawn.nodes}
                edges={drawn.edges}
                clusters={drawn.clusters}
                colors={colors}
                selected={selected}
                onSelect={setSelected}
                route={drawn.route}
              />
            )}
            {tip && (
              <p
                id="graph-tip"
                className="absolute bottom-3 left-3 max-w-72 rounded-card border border-line bg-card px-3 py-2 type-small text-ink-soft shadow-paper"
              >
                Each circle is a person, in the color of their space (the dots on the buttons
                above); grey ones aren&apos;t in a space.{' '}
                <span className="hidden md:inline">
                  Point at someone, or at a line, to see how they&apos;re connected; click someone
                  to open them beside the graph.
                </span>
                <span className="md:hidden">
                  Tap a line to see what it means; tap someone to open them or show only their
                  links.
                </span>
              </p>
            )}
            <div className="absolute right-3 bottom-3 flex flex-col gap-1">
              <Button
                variant="secondary"
                aria-label="How to read the graph"
                aria-expanded={tip}
                aria-controls="graph-tip"
                onClick={() => setTip(!tip)}
                className={cn('size-9 bg-card px-0', tip && 'bg-hover')}
              >
                <Info aria-hidden />
              </Button>
              <CanvasButton label="Zoom in" onClick={() => canvas.current?.zoomIn()}>
                <Plus aria-hidden />
              </CanvasButton>
              <CanvasButton label="Zoom out" onClick={() => canvas.current?.zoomOut()}>
                <Minus aria-hidden />
              </CanvasButton>
              <CanvasButton label="Fit" onClick={() => canvas.current?.fitNodesInView()}>
                <Maximize aria-hidden />
              </CanvasButton>
            </div>
          </div>
          {how && (
            <RouteSummary
              key={how}
              personId={how}
              shown={shownIndex}
              onShow={(index) => setAlternative({ how, index })}
              onClear={() => showRoute()}
            />
          )}
        </div>
      </div>
      {selected && (
        <>
          <PeekPanel
            personId={selected}
            onClose={closePreview}
            actions={
              <>
                <Button variant="ghost" onClick={() => setFocus(selected)}>
                  Focus
                </Button>
                {selected !== meId && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      showRoute(selected)
                      closePreview()
                    }}
                  >
                    How do I know them?
                  </Button>
                )}
              </>
            }
          />
          <NodeSheet
            personId={selected}
            onClose={closePreview}
            onFocus={() => setFocus(selected)}
            onHow={() => {
              showRoute(selected)
              closePreview()
            }}
          />
        </>
      )}
    </div>
  )
}

function CanvasButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      variant="secondary"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="size-9 bg-card px-0"
    >
      {children}
    </Button>
  )
}

/** Spaces, Family only, Hide former. */
function FilterBar({
  graph,
  filters,
  onChange,
}: {
  graph: Parameters<typeof graphSpaces>[0]
  filters: Filters
  onChange: (filters: Filters) => void
}) {
  const spaces = graphSpaces(graph)
  const toggleSpace = (spaceId: string) =>
    onChange({
      ...filters,
      spaces: filters.spaces.includes(spaceId)
        ? filters.spaces.filter((id) => id !== spaceId)
        : [...filters.spaces, spaceId],
    })

  return (
    <div className="mt-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filters">
      {spaces.map((space) => (
        <Toggle
          key={space.id}
          pressed={filters.spaces.includes(space.id)}
          onClick={() => toggleSpace(space.id)}
          space={space.color}
        >
          {space.name}
        </Toggle>
      ))}
      {spaces.length > 0 && <span aria-hidden className="mx-1 h-5 w-px bg-line-strong" />}
      <Toggle
        pressed={filters.familyOnly}
        onClick={() => onChange({ ...filters, familyOnly: !filters.familyOnly })}
      >
        Family only
      </Toggle>
      <Toggle
        pressed={filters.hideFormer}
        onClick={() => onChange({ ...filters, hideFormer: !filters.hideFormer })}
      >
        Hide former
      </Toggle>
    </div>
  )
}

/** The node preview on phones: a sheet from the bottom (screen 3d). */
function NodeSheet({
  personId,
  onClose,
  onFocus,
  onHow,
}: {
  personId: string
  onClose: () => void
  onFocus: () => void
  /** "How do I know them?" */
  onHow: () => void
}) {
  const person = useQuery(personQuery(personId)).data
  const aids = useQuery(memoryAidsQuery(personId)).data ?? []
  const { openLog } = useInteractionForm()
  if (!person) return null

  return (
    <section
      aria-label={`${person.name}, preview`}
      className="fixed inset-x-0 bottom-0 z-20 rounded-t-sheet border-t border-line bg-paper p-5 pb-24 shadow-float md:hidden"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="type-title">{person.name}</h2>
          {person.how_we_met && <p className="type-small text-ink-soft">{person.how_we_met}</p>}
        </div>
        <Button variant="ghost" aria-label="Close preview" className="w-9 px-0" onClick={onClose}>
          <X aria-hidden />
        </Button>
      </div>
      {aids[0] && <p className="mt-3 type-hand">{aids[0].text}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/people/$personId" params={{ personId }}>
            Open profile
          </Link>
        </Button>
        <Button variant="secondary" onClick={onFocus}>
          Focus
        </Button>
        {!person.is_me && (
          <>
            <Button variant="secondary" onClick={onHow}>
              How do I know them?
            </Button>
            <Button variant="ghost" onClick={() => openLog(personId)}>
              Log
            </Button>
          </>
        )}
      </div>
    </section>
  )
}

const PROMPTS = ['mum?', 'best friend?', 'a colleague?', 'neighbour?', 'that climbing crew?']

/** Just you so far (screens 3m, 3n). */
function EmptyGraph() {
  const { openNew } = usePersonForm()
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
      <PageHeader title="Graph" meta="Just you" />
      <div className="flex flex-col items-center px-4 py-12 text-center">
        <div aria-hidden className="flex flex-wrap justify-center gap-2">
          {PROMPTS.map((prompt) => (
            <span
              key={prompt}
              className="rounded-full border border-dashed border-line-strong px-3 py-1 type-hand text-ink-soft"
            >
              {prompt}
            </span>
          ))}
        </div>
        <h2 className="mt-6 type-title">Your graph starts with you</h2>
        <p className="mt-2 max-w-sm text-ink-soft">
          Add people and how you know them: the lines draw themselves.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          <Button onClick={() => openNew()}>Add someone</Button>
          <Button asChild variant="secondary">
            <Link to="/capture">Quick capture</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
