import { Button } from '@/components/ui/button'
import { countOf } from '@/features/person/labels'
import type { Bubble } from './fold'

type FoldBannerProps = {
  /** Faraway spaces are folded now (else this device shows all). */
  folded: boolean
  shown: number
  total: number
  /** The bubble pointed at, if any: the banner says what clicking it does. */
  pointed?: Bubble
  onToggle: () => void
}

/** Over a big notebook's graph (screen 3j): how much is shown, and Show all / Fold. */
export function FoldBanner({ folded, shown, total, pointed, onToggle }: FoldBannerProps) {
  const hint = pointed
    ? `Unfold ${pointed.space?.name ?? 'Not in any space'} · ${countOf(pointed.count, 'person', 'people')} · you know ${pointed.direct} directly`
    : 'faraway spaces are folded — click one to unfold'
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-line bg-card py-1 pr-1 pl-3 type-small text-ink-soft">
      <p className="min-w-0 flex-1">
        {folded ? `You + 2 steps · ${shown} of ${total} · ${hint}` : `Showing all ${total}`}
      </p>
      <Button variant="ghost" className="h-9 md:h-8" onClick={onToggle}>
        {folded ? `Show all ${total}` : 'Fold faraway spaces'}
      </Button>
    </div>
  )
}
