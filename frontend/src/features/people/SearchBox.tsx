import { Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'

const DEBOUNCE_MS = 250

type SearchBoxProps = {
  value: string
  /** Called once typing pauses, not on every key. */
  onSearch: (text: string) => void
}

/** The People search: names, notes, memory aids, spaces and tags. */
export function SearchBox({ value, onSearch }: SearchBoxProps) {
  const [text, setText] = useState(value)
  const [lastValue, setLastValue] = useState(value)

  // Follow outside changes (back button, "Clear filters").
  if (value !== lastValue) {
    setLastValue(value)
    setText(value)
  }

  useEffect(() => {
    if (text === value) return
    const timer = setTimeout(() => onSearch(text), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text, value, onSearch])

  return (
    <div role="search" className="relative">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint"
      />
      <Input
        type="search"
        aria-label="Search people"
        placeholder="Search people, notes, memory aids"
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="px-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {text && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setText('')
            onSearch('')
          }}
          className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-card text-ink-faint hover:text-ink"
        >
          <X aria-hidden className="size-4" />
        </button>
      )}
    </div>
  )
}
