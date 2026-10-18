import { Maximize, Minus, Plus } from 'lucide-react'
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from 'react'
import { relationChainLabel } from '@/features/person/labels'
import { firstNameOf, initials } from '@/lib/names'
import { cn } from '@/lib/utils'
import { CanvasButton } from './CanvasButton'
import {
  NODE_WIDTH,
  ROW_HEIGHT,
  layoutTree,
  type PlacedPerson,
  type PlacedSlot,
  type TreeData,
  type TreeLine,
  type TreeToggles,
} from './treeLayout'

type FamilyTreeProps = {
  data: TreeData
  toggles: TreeToggles
  /** The person open beside the tree. */
  selected: string | null
  onSelect: (personId: string) => void
  /** An "Add parent" slot was picked: a parent for this person. */
  onAddParent: (personId: string) => void
}

type View = { x: number; y: number; scale: number }

const MIN_SCALE = 0.3
const MAX_SCALE = 2
const ZOOM_STEP = 1.25
/** Room kept around the tree when it fits itself into view. */
const FIT_MARGIN = 24
/** Where a face sits in its place: the line ends at its middle. */
const FACE_TOP = 22

const clamp = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))

/** Family tree mode (screens 3k, 3l): rows of generations, drawn with lines behind people. */
export function FamilyTree({ data, toggles, selected, onSelect, onAddParent }: FamilyTreeProps) {
  const layout = useMemo(() => layoutTree(data, toggles), [data, toggles])
  const frame = useRef<HTMLElement>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 })
  const drag = useRef<{ x: number; y: number } | null>(null)

  const fit = () => {
    const box = frame.current
    const width = box?.clientWidth ?? 0
    const height = box?.clientHeight ?? 0
    // Not measured yet (or not on screen): draw at full size from the corner.
    if (!width || !height) return setView({ x: 0, y: 0, scale: 1 })
    const scale = clamp(
      Math.min(
        1,
        (width - 2 * FIT_MARGIN) / layout.width,
        (height - 2 * FIT_MARGIN) / layout.height,
      ),
    )
    setView({
      x: (width - layout.width * scale) / 2,
      y: (height - layout.height * scale) / 2,
      scale,
    })
  }
  // Fits itself when it opens and when it's someone else's tree; not on every toggle.
  const fittedFor = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (fittedFor.current === data.root) return
    fittedFor.current = data.root
    fit()
  })

  /** Zoom by `factor`, keeping the point (px, py) of the frame where it is. */
  const zoom = (factor: number, px?: number, py?: number) =>
    setView((now) => {
      const scale = clamp(now.scale * factor)
      const cx = px ?? (frame.current?.clientWidth ?? 0) / 2
      const cy = py ?? (frame.current?.clientHeight ?? 0) / 2
      return {
        scale,
        x: cx - ((cx - now.x) * scale) / now.scale,
        y: cy - ((cy - now.y) * scale) / now.scale,
      }
    })

  const onWheel = (event: WheelEvent) => {
    const box = event.currentTarget.getBoundingClientRect()
    zoom(
      event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP,
      event.clientX - box.left,
      event.clientY - box.top,
    )
  }
  const onPointerDown = (event: PointerEvent) => {
    if ((event.target as Element).closest('button')) return
    drag.current = { x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: PointerEvent) => {
    const from = drag.current
    if (!from) return
    drag.current = { x: event.clientX, y: event.clientY }
    setView((now) => ({
      ...now,
      x: now.x + event.clientX - from.x,
      y: now.y + event.clientY - from.y,
    }))
  }
  const onPointerUp = () => {
    drag.current = null
  }

  return (
    <section
      ref={frame}
      aria-label="Family tree"
      className="relative h-full touch-none overflow-hidden select-none"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        data-tree-view
        className="absolute top-0 left-0 origin-top-left"
        style={{
          width: layout.width,
          height: layout.height,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
        }}
      >
        {layout.rows.map((row) => (
          <div
            key={row.generation}
            className="absolute inset-x-0 border-t border-line"
            style={{ top: row.y - ROW_HEIGHT / 2 }}
          >
            <span className="absolute top-1 left-1 type-meta text-ink-faint">{row.label}</span>
          </div>
        ))}
        <svg
          aria-hidden
          width={layout.width}
          height={layout.height}
          className="absolute inset-0 overflow-visible"
        >
          {layout.lines.map((line) => (
            <Line key={line.id} line={line} />
          ))}
        </svg>
        {layout.slots.map((slot) => (
          <Slot key={slot.key} slot={slot} onPick={() => onAddParent(slot.childId)} />
        ))}
        {layout.people.map((placed) => (
          <Person
            key={placed.person.id}
            placed={placed}
            root={placed.person.id === data.root}
            selected={placed.person.id === selected}
            onPick={() => onSelect(placed.person.id)}
          />
        ))}
      </div>
      <Legend />
      <div className="absolute right-3 bottom-3 flex flex-col gap-1">
        <CanvasButton label="Zoom in" onClick={() => zoom(ZOOM_STEP)}>
          <Plus aria-hidden />
        </CanvasButton>
        <CanvasButton label="Zoom out" onClick={() => zoom(1 / ZOOM_STEP)}>
          <Minus aria-hidden />
        </CanvasButton>
        <CanvasButton label="Fit" onClick={fit}>
          <Maximize aria-hidden />
        </CanvasButton>
      </div>
    </section>
  )
}

/** Where a person's or slot's place starts, so its face is centred on (x, y). */
const placeAt = (x: number, y: number) => ({
  left: x - NODE_WIDTH / 2,
  top: y - FACE_TOP,
  width: NODE_WIDTH,
})

function Person({
  placed: { person, x, y },
  root,
  selected,
  onPick,
}: {
  placed: PlacedPerson
  root: boolean
  selected: boolean
  onPick: () => void
}) {
  const relation = person.is_me ? 'Me' : relationChainLabel(person.relation)
  return (
    <button
      type="button"
      aria-label={relation ? `${person.name}, ${relation}` : person.name}
      aria-pressed={selected}
      onClick={onPick}
      className="group absolute flex cursor-pointer flex-col items-center gap-1 rounded-card px-1 text-center"
      style={placeAt(x, y)}
    >
      <span
        aria-hidden
        className={cn(
          'flex items-center justify-center overflow-hidden rounded-full border bg-card font-semibold text-ink',
          root ? 'size-14 border-2 border-accent text-md' : 'size-11 border-line-strong type-small',
          selected && 'ring-2 ring-accent ring-offset-2 ring-offset-paper',
        )}
      >
        {person.photo_url ? (
          <img src={person.photo_url} alt="" className="size-full object-cover" />
        ) : (
          initials(person.name)
        )}
      </span>
      <span aria-hidden className="max-w-full truncate type-small font-medium text-ink">
        {person.is_me ? 'Me' : person.name}
      </span>
      <span aria-hidden className="line-clamp-2 max-w-full type-meta text-ink-soft normal-case">
        {person.is_me ? person.name : relation}
      </span>
    </button>
  )
}

function Slot({ slot, onPick }: { slot: PlacedSlot; onPick: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Add parent of ${slot.childName}`}
      onClick={onPick}
      className="absolute flex cursor-pointer flex-col items-center gap-1 rounded-card px-1 text-center text-ink-soft hover:text-ink"
      style={placeAt(slot.x, slot.y)}
    >
      <span
        aria-hidden
        className="flex size-11 items-center justify-center rounded-full border border-dashed border-line-strong bg-paper"
      >
        <Plus className="size-4" />
      </span>
      <span aria-hidden className="type-small font-medium">
        Add parent
      </span>
      <span aria-hidden className="type-meta normal-case">
        of {firstNameOf(slot.childName)}
      </span>
    </button>
  )
}

const DASH = { dashed: '6 4', dotted: '1 4' }

function Line({ line }: { line: TreeLine }) {
  const [[x1, y1], [x2, y2]] = [line.points[0], line.points.at(-1)!]
  const bend = line.points.length === 3 ? line.points[1] : null
  // An arc over someone in between peaks halfway to its bend; the words sit on top of it.
  const [lx, ly] = bend ? [bend[0], (y1 + 2 * bend[1] + y2) / 4] : [(x1 + x2) / 2, (y1 + y2) / 2]
  const stroke = {
    fill: 'none',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeDasharray: line.dashed ? DASH.dashed : line.dotted ? DASH.dotted : undefined,
    className: line.kind === 'slot' ? 'stroke-line' : 'stroke-line-strong',
  }
  return (
    <g>
      {bend ? (
        <path d={`M ${x1} ${y1} Q ${bend[0]} ${bend[1]} ${x2} ${y2}`} {...stroke} />
      ) : (
        <polyline points={line.points.map(([x, y]) => `${x},${y}`).join(' ')} {...stroke} />
      )}
      {line.label && (
        <text
          x={lx}
          y={ly - 6}
          textAnchor="middle"
          className={cn('text-xs', line.label === 'partner' ? 'fill-ink-faint' : 'fill-ink-soft')}
        >
          {line.label}
        </text>
      )}
    </g>
  )
}

/** What the lines mean (3k's key, bottom left). */
function Legend() {
  return (
    <ul
      aria-label="Legend"
      className="absolute right-15 bottom-3 left-3 flex w-fit flex-wrap items-center gap-x-4 gap-y-1 rounded-card border border-line bg-card px-3 py-2 type-meta text-ink-soft normal-case shadow-paper"
    >
      <LegendItem dash={undefined}>parent · partner</LegendItem>
      <LegendItem dash={DASH.dashed}>former</LegendItem>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-3 rounded-full border border-dashed border-line-strong" />
        <span>missing — click to add</span>
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="text-ink">
          abc
        </span>
        <span>step · adoptive</span>
      </li>
    </ul>
  )
}

function LegendItem({ dash, children }: { dash: string | undefined; children: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <svg aria-hidden width="20" height="6">
        <line
          x1="1"
          y1="3"
          x2="19"
          y2="3"
          strokeWidth={1.5}
          strokeDasharray={dash}
          className="stroke-line-strong"
        />
      </svg>
      <span>{children}</span>
    </li>
  )
}
