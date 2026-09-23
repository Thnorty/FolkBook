import { PageHeader } from '@/components/PageHeader'

type PlaceholderPageProps = {
  title: string
  /** What this page will hold, until it's built. */
  note: string
}

/** Stands in for a screen that isn't built yet, so navigation works end to end. */
export function PlaceholderPage({ title, note }: PlaceholderPageProps) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
      <PageHeader title={title} />
      <p className="mt-6 max-w-prose text-ink-soft">{note}</p>
    </div>
  )
}
