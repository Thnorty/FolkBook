import { SearchCommand } from '@/app/SearchCommand'
import { usePageTitle } from '@/lib/usePageTitle'

/** Search on phones (screens 4y, 4z): the palette, as a page. */
export function SearchPage() {
  usePageTitle('Search')
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="overflow-hidden rounded-card border border-line bg-card">
        <SearchCommand onDone={() => {}} />
      </div>
    </div>
  )
}
