import { useInfiniteQuery } from '@tanstack/react-query'
import { useDeferredValue, useState, type ReactNode, type Ref } from 'react'
import { Input } from '@/components/ui/input'
import { labelClass } from '@/components/ui/label'
import { pickerListClass } from '@/components/ui/menu'
import { cn } from '@/lib/utils'
import { peopleListQuery, type Person } from './queries'

type PersonSearchProps = {
  id: string
  label: string
  placeholder: string
  /** People never offered (e.g. the person being connected, or your Me). */
  exclude?: string[]
  autoFocus?: boolean
  onPick: (person: Person) => void
  /** A last row under the matches, given what was typed (Connect's "Create …"). */
  extra?: (search: string) => ReactNode
  inputRef?: Ref<HTMLInputElement>
}

/** Find someone in your book with the server's search (Unicode names): up to 6 matches. */
export function PersonSearch({
  id,
  label,
  placeholder,
  exclude = [],
  autoFocus,
  onPick,
  extra,
  inputRef,
}: PersonSearchProps) {
  const [search, setSearch] = useState('')
  const deferred = useDeferredValue(search.trim())
  const results = useInfiniteQuery({
    ...peopleListQuery({ search: deferred }),
    enabled: deferred.length > 0,
  })
  const matches = (results.data?.pages[0]?.items ?? [])
    .filter((match) => !exclude.includes(match.id))
    .slice(0, 6)

  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <Input
        ref={inputRef}
        id={id}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
      />
      {deferred && (
        <ul aria-label="People" className={pickerListClass}>
          {matches.map((match) => (
            <li key={match.id}>
              <button
                type="button"
                onClick={() => onPick(match)}
                className="flex w-full cursor-pointer items-baseline gap-3 rounded-tab px-2 py-2 text-left hover:bg-hover focus-visible:ring-3 focus-visible:ring-focus-glow focus-visible:outline-none"
              >
                <span className="font-serif text-lg">{match.name}</span>
                <span className="ml-auto truncate type-meta text-ink-faint">
                  {match.spaces.map((space) => space.name).join(' · ')}
                </span>
              </button>
            </li>
          ))}
          {extra && (
            <li className={cn(matches.length > 0 && 'mt-1 border-t border-line pt-1')}>
              {extra(search.trim())}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
