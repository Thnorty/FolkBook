import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

const PROMPTS = ['mum?', 'best friend?', 'neighbour?']

/** Nobody in the notebook yet but you (screen 6h). */
export function EmptyBook() {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <div aria-hidden className="flex gap-2">
        {PROMPTS.map((prompt) => (
          <span
            key={prompt}
            className="rounded-full border border-dashed border-line-strong px-3 py-1 type-hand text-ink-soft"
          >
            {prompt}
          </span>
        ))}
      </div>
      <h2 className="mt-6 type-title">Your book is empty</h2>
      <p className="mt-2 max-w-sm text-ink-soft">
        Start with three people you&apos;d hate to forget something about.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2.5">
        <Button asChild>
          <Link to="/people/new">Add someone</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to="/capture">Quick capture</Link>
        </Button>
      </div>
    </div>
  )
}
