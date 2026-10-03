import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Maximize, Minus, Plus, X } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import type { GraphCanvasRef } from 'reagraph'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { PeekPanel } from '@/features/people/PeekPanel'
import { countOf } from '@/features/person/labels'
import { memoryAidsQuery, personQuery } from '@/features/person/queries'
import { useInteractionForm } from '@/features/person/useInteractionForm'
import { usePersonForm } from '@/features/person/usePersonForm'
import { cn } from '@/lib/utils'
import { graphSpaces, graphSummary, NO_FILTERS, toCanvas, type Filters } from './graphModel'
import { NetworkCanvas } from './NetworkCanvas'
import { graphQuery, neighborhoodQuery } from './queries'
import { useNodeFaces } from './faces'
import { useCanvasColors } from './usePalette'

/** The network: you in the middle, everyone around, clustered by space (3b–3e, 3m, 3n). */
export function GraphPage() {
  const graph = useQuery(graphQuery)
  const [focus, setFocus] = useState<string | null>(null)
  const focused = useQuery({ ...neighborhoodQuery(focus ?? ''), enabled: focus !== null })
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [selected, setSelected] = useState<string | null>(null)
  const colors = useCanvasColors()
  const canvas = useRef<GraphCanvasRef>(null)
  const closePreview = useCallback(() => setSelected(null), [])

  const shown = (focus && focused.data) || graph.data
  const faces = useNodeFaces(graph.data?.nodes, colors)
  const drawn = useMemo(
    () => shown && toCanvas(shown, filters, colors.palette, faces),
    [shown, filters, colors.palette, faces],
  )
  const summary = graph.data && graphSummary(graph.data)
  const focusName = focus && shown?.nodes.find((node) => node.id === focus)?.name

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
    <div
      className={cn(
        'mx-auto px-4 py-6 md:px-8',
        selected
          ? 'max-w-7xl md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] md:gap-6'
          : 'max-w-6xl',
      )}
    >
      <div className="min-w-0">
        <PageHeader
          title="Graph"
          meta={
            summary &&
            `${countOf(summary.people, 'person', 'people')} · ${countOf(summary.connections, 'connection')}`
          }
        />
        <FilterBar graph={graph.data} filters={filters} onChange={setFilters} />
        {focus && (
          <p className="mt-3 flex items-center gap-2 type-small text-ink-soft">
            Focused on {focusName ?? '…'} and the people one step away.
            <Button variant="ghost" onClick={() => setFocus(null)}>
              Show everyone
            </Button>
          </p>
        )}
        <div className="relative mt-4 h-[65dvh] overflow-hidden rounded-card border border-line bg-paper">
          {drawn && (
            <NetworkCanvas
              ref={canvas}
              nodes={drawn.nodes}
              edges={drawn.edges}
              colors={colors}
              selected={selected}
              onSelect={setSelected}
            />
          )}
          <div className="absolute right-3 bottom-3 flex flex-col gap-1">
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
        <p className="mt-2 type-small text-ink-soft">
          Each circle is a person, in the color of their space (the dots on the buttons above); grey
          ones aren&apos;t in a space.{' '}
          <span className="hidden md:inline">
            Point at someone to see how they&apos;re related; click to open them beside the graph.
          </span>
          <span className="md:hidden">
            Tap someone to see how they&apos;re related, open them or show only their links.
          </span>
        </p>
      </div>
      {selected && (
        <>
          <PeekPanel personId={selected} onClose={closePreview} />
          <NodeSheet
            personId={selected}
            onClose={closePreview}
            onFocus={() => setFocus(selected)}
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

function Toggle({
  pressed,
  onClick,
  space,
  children,
}: {
  pressed: boolean
  onClick: () => void
  space?: string
  children: string
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      data-space={space}
      className={cn(
        'flex h-11 cursor-pointer items-center gap-1.5 rounded-full border border-line-input px-3.5 text-md font-medium text-ink-soft hover:border-line-strong md:h-8',
        pressed &&
          (space
            ? 'border-space bg-space text-on-space'
            : 'border-accent bg-accent text-on-accent'),
      )}
    >
      {space && !pressed && <span aria-hidden className="size-2 rounded-full bg-space" />}
      {children}
    </button>
  )
}

/** The node preview on phones: a sheet from the bottom (screen 3d). */
function NodeSheet({
  personId,
  onClose,
  onFocus,
}: {
  personId: string
  onClose: () => void
  onFocus: () => void
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
          <Button variant="ghost" onClick={() => openLog(personId)}>
            Log
          </Button>
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
