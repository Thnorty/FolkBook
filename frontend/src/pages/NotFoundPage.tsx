import { Link } from '@tanstack/react-router'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <PageHeader title="Page not found" />
      <p className="mt-6 text-ink-soft">This page isn&apos;t in the notebook.</p>
      <Button asChild className="mt-6">
        <Link to="/">Back to Today</Link>
      </Button>
    </main>
  )
}
