import { Link, useParams } from '@tanstack/react-router'
import { ProfileView } from './ProfileView'

/** A person's own page (screens 1b on phones, 1d on desktop). */
export function ProfilePage() {
  const { personId } = useParams({ from: '/app/people/$personId' })
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
      <Link to="/people" className="mb-6 inline-block type-meta text-ink-faint hover:text-ink">
        ← People
      </Link>
      <ProfileView personId={personId} />
    </div>
  )
}
