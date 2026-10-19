import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { countOf } from '@/features/person/labels'
import { bubbleName, type Bubble, type SpaceRef } from './fold'

type FoldBannerProps = {
  /** Faraway spaces are folded now (else this device shows all). */
  folded: boolean
  shown: number
  total: number
  /** How many bubbles are drawn: with none, there's nothing to unfold. */
  bubbles: number
  /** Spaces unfolded by a click this visit; each can be folded back. */
  unfolded: { id: string; space: SpaceRef | null }[]
  /** The bubble pointed at, if any: the banner says what clicking it does. */
  pointed?: Bubble
  onShowAll: () => void
  /** Back to how the graph started: every faraway space folded. */
  onFoldAll: () => void
  onFoldSpace: (id: string) => void
}

/** Over a big notebook's graph (screen 3j): how much is shown, what's unfolded, Show all / Fold. */
export function FoldBanner({
  folded,
  shown,
  total,
  bubbles,
  unfolded,
  pointed,
  onShowAll,
  onFoldAll,
  onFoldSpace,
}: FoldBannerProps) {
  const hint = pointed
    ? `Unfold ${bubbleName(pointed)} · ${countOf(pointed.count, 'person', 'people')} · you know ${pointed.direct} directly`
    : bubbles > 0 && 'faraway spaces are folded — click one to unfold'
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-line bg-card py-1 pr-1 pl-3 type-small text-ink-soft">
      <p className="min-w-0 flex-1">
        {folded
          ? [`You + 2 steps · ${shown} of ${total}`, hint].filter(Boolean).join(' · ')
          : `Showing all ${total}`}
      </p>
      {folded && unfolded.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span>Unfolded:</span>
          {unfolded.map(({ id, space }) => (
            <button
              key={id}
              type="button"
              aria-label={`Fold ${bubbleName({ space })} again`}
              title={`Fold ${bubbleName({ space })} again`}
              onClick={() => onFoldSpace(id)}
              data-space={space?.color}
              className="flex h-9 cursor-pointer items-center gap-1 rounded-full border border-line-input px-2.5 font-medium text-ink-soft hover:border-line-strong hover:text-ink md:h-7"
            >
              {space && <span aria-hidden className="size-2 rounded-full bg-space" />}
              {bubbleName({ space })}
              <X aria-hidden className="size-3.5" />
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-1">
        {(!folded || unfolded.length > 0) && (
          <Button variant="ghost" className="h-9 md:h-8" onClick={onFoldAll}>
            Fold faraway spaces
          </Button>
        )}
        {folded && (
          <Button variant="ghost" className="h-9 md:h-8" onClick={onShowAll}>
            Show all {total}
          </Button>
        )}
      </div>
    </div>
  )
}
