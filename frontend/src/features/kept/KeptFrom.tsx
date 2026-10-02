import { usePersonForm } from '@/features/person/usePersonForm'
import type { PersonDetail } from '@/features/person/queries'
import { formatDay, isoDay } from '@/lib/dates'

/** The "kept" mark on a copy (screens 4n, 4o). */
export function KeptBadge() {
  return (
    <span className="rounded-full border border-line-strong px-2 type-meta text-ink-faint">
      Kept
    </span>
  )
}

type Kept = NonNullable<PersonDetail['kept']>

/** "Kept copy · was shared by Defne in Hackathon 2026 until 22 Sep 2026" (screen 4o). */
export function KeptFrom({ personId, kept }: { personId: string; kept: Kept }) {
  const { openEdit } = usePersonForm()
  const until = formatDay(isoDay(0, new Date(kept.at)))
  return (
    <div className="flex items-start gap-3 rounded-card border border-dashed border-line-strong px-4 py-3">
      <KeptBadge />
      <div className="min-w-0 flex-1">
        <p className="type-small text-ink-soft">
          {kept.space
            ? `Kept copy · was shared by ${kept.from_owner} in ${kept.space} until ${until}`
            : `Kept copy · was in ${kept.from_owner}'s book until ${until}`}
        </p>
        <button
          type="button"
          onClick={() => openEdit(personId)}
          className="mt-1 type-small font-medium text-accent hover:underline"
        >
          Add to a space
        </button>
      </div>
    </div>
  )
}
