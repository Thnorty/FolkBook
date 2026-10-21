import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Info, Maximize, Minus, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GraphCanvasRef } from 'reagraph'
import { currentUserQuery } from '@/api/session'
import { Doodle } from '@/components/notebook/Doodle'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { PeekPanel } from '@/features/people/PeekPanel'
import { Count } from '@/features/person/Count'
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
import { CanvasButton } from './CanvasButton'
import { FamilyTreeView } from './FamilyTreeView'
import { FOLD_ABOVE, foldGraph, isBubble, spaceOfBubble } from './fold'
import { FoldBanner } from './FoldBanner'
import { useShowAll } from './foldPreference'
import { ModeSwitch } from './ModeSwitch'
import { NetworkCanvas } from './NetworkCanvas'
import { NodeSheet } from './NodeSheet'
import { graphQuery, neighborhoodQuery, pathsQuery } from './queries'
import { RouteSummary } from './RouteSummary'
import type { GraphSearch } from './search'
import { useNodeFaces } from './faces'
import { Toggle } from './Toggle'
import { useCanvasColors } from './usePalette'
import { useStepReveal } from './useStepReveal'
import { firstNameOf } from '@/lib/names'

/** The graph: the network, or someone's family tree (?tree=). */
export function GraphPage() {
  // Typed by hand: this page is loaded lazily, so the router's own types can't reach it.
  const search: GraphSearch = useSearch({ from: '/app/graph' })
  return search.tree ? <FamilyTreeView rootId={search.tree} /> : <NetworkView search={search} />
}

/** The network: you in the middle, everyone around, clustered by space (3b–3e, 3m, 3n). */
function NetworkView({ search: { how: asked, focus, hops } }: { search: GraphSearch }) {
  const graph = useQuery(graphQuery)
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

  // Big notebooks start with you + 2 steps, faraway spaces folded (3j); not in focus mode
  // once its own steps have arrived (until then the folded view stays, not all 900), nor
  // on a device that chose Show all.
  const [showAll, setShowAll] = useShowAll()
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(new Set())
  const [pointed, setPointed] = useState<string | null>(null)
  const people = graph.data ? graphSummary(graph.data).people : 0
  const big = people > FOLD_ABOVE
  const focusShown = Boolean(focus && focused.data)
  const folded = useMemo(() => {
    if (!big || showAll || focusShown || !graph.data) return null
    return foldGraph(graph.data, {
      unfolded,
      keep: new Set(route ? routePeople(route) : []),
      // A space picked in the filters is one you want to see: everyone in it.
      spaces: new Set(filters.spaces),
    })
  }, [big, showAll, focusShown, graph.data, unfolded, filters.spaces, route])
  // With spaces picked, the other spaces' bubbles go too, like their people.
  const bubbles = useMemo(
    () =>
      folded && {
        bubbles: folded.bubbles.filter(
          (bubble) => !filters.spaces.length || filters.spaces.includes(bubble.space?.id ?? ''),
        ),
        lines: folded.lines,
      },
    [folded, filters.spaces],
  )

  const shown = (focus && focused.data) || folded?.graph || graph.data
  const faces = useNodeFaces(graph.data?.nodes, colors)
  const drawn = useMemo(() => {
    if (!shown) return undefined
    const folds = bubbles ?? undefined
    if (!route) {
      // The focused person stays drawn whatever the filters say.
      const keep = new Set(focus ? [focus] : [])
      return {
        ...toCanvas(shown, filters, colors.palette, faces, keep, folds),
        route: undefined,
      }
    }
    const keep = new Set(routePeople(route))
    return withRoute(
      toCanvas(shown, filters, colors.palette, faces, keep, folds),
      route,
      steps,
      colors.palette,
    )
  }, [shown, filters, colors.palette, faces, route, steps, focus, bubbles])
  // A bubble unfolds its space; it's nobody to open beside the graph.
  const pick = (id: string | null) => {
    if (id && isBubble(id)) setUnfolded((now) => new Set([...now, spaceOfBubble(id)]))
    else setSelected(id)
  }
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
    if (focused.error) return <span className="text-danger">{focused.error.message}</span>
    // While another person's or another number of steps' answer loads, the drawing
    // stays, but its numbers would be wrong.
    if (!focused.data || focused.isPlaceholderData || !graph.data) return null
    if (focused.data.nodes.length <= 1) {
      return `Nobody else is connected to ${focusName ? firstNameOf(focusName) : 'them'} yet.`
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
            summary && [
              <Count key="people" value={summary.people} one="person" many="people" />,
              <Count key="connections" value={summary.connections} one="connection" />,
            ]
          }
          actions={
            <ModeSwitch
              mode="network"
              onChange={() => void navigate({ search: { tree: selected ?? meId } })}
            />
          }
        />
        <div className="mt-4">
          <HowDoIKnow personId={how} meId={meId} onPick={showRoute} onClear={() => showRoute()} />
        </div>
        <FilterBar graph={graph.data} filters={filters} onChange={setFilters} />
        {big && !focus && (
          <FoldBanner
            folded={Boolean(folded)}
            bubbles={bubbles?.bubbles.length ?? 0}
            shown={folded?.shown ?? people}
            total={people}
            unfolded={[...unfolded].map((id) => ({
              id,
              space: graphSpaces(graph.data).find((space) => space.id === id) ?? null,
            }))}
            pointed={folded?.bubbles.find((bubble) => bubble.id === pointed)}
            onShowAll={() => setShowAll(true)}
            onFoldAll={() => {
              // Back to the start: every faraway space folded, as when the graph opened.
              setUnfolded(new Set())
              setShowAll(false)
            }}
            onFoldSpace={(id) =>
              setUnfolded((now) => new Set([...now].filter((space) => space !== id)))
            }
          />
        )}
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
                onSelect={pick}
                onPoint={setPointed}
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
            primary={{ label: 'Focus', onClick: () => setFocus(selected) }}
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

const PROMPTS = ['mum?', 'best friend?', 'a colleague?', 'neighbour?', 'that climbing crew?']

/** Dashed bubbles for the people who'll join you. */
function Prompts({ prompts }: { prompts: string[] }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {prompts.map((prompt) => (
        <span
          key={prompt}
          className="rounded-full border border-dashed border-line-strong px-3 py-1 type-hand text-ink-soft"
        >
          {prompt}
        </span>
      ))}
    </div>
  )
}

/** Just you so far (screens 3m, 3n). */
function EmptyGraph() {
  const { openNew } = usePersonForm()
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
      <PageHeader title="Graph" meta="Just you" />
      <div className="flex flex-col items-center px-4 py-12 text-center">
        <div aria-hidden className="flex flex-col items-center">
          <Prompts prompts={PROMPTS.slice(0, 2)} />
          <Doodle viewBox="0 0 160 44" className="h-11 w-40 text-ink-soft">
            <path strokeDasharray="2 4" d="M72 18 44 4M88 18l28-14M72 26 40 40M88 26l32 14" />
            <circle cx="80" cy="22" r="5" fill="currentColor" className="text-ink" />
          </Doodle>
          <Prompts prompts={PROMPTS.slice(2)} />
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
