import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { AuthFrame } from '@/components/AuthFrame'
import { Button } from '@/components/ui/button'
import { firstNameOf } from '@/lib/names'
import { usePageTitle } from '@/lib/usePageTitle'
import { logTalked, talkedQuery, unsubscribe, unsubscribeQuery } from './queries'

/**
 * The pages behind the links in reminder emails. They work without logging in, and
 * opening one changes nothing (email scanners open links): the button does.
 */

/** "Unsubscribe" in a reminder email. */
export function UnsubscribePage() {
  const { token } = useParams({ from: '/unsubscribe/$token' })
  const link = useQuery(unsubscribeQuery(token))
  const stop = useMutation({ mutationFn: () => unsubscribe(token) })
  usePageTitle('Unsubscribe')

  if (link.isPending) return <Opening />
  if (link.isError) return <Broken message={link.error.message} />

  if (stop.isSuccess || !link.data.subscribed) {
    return (
      <AuthFrame>
        <h1 className="mt-6 type-title">You&apos;re unsubscribed</h1>
        <p className="mt-2 text-ink-soft">
          No more reminder emails to {link.data.email}. You can turn them back on in Settings, under
          Reminders.
        </p>
        <Button asChild variant="secondary" className="mt-6 w-full">
          <Link to="/settings/reminders">Reminder settings</Link>
        </Button>
      </AuthFrame>
    )
  }
  return (
    <AuthFrame>
      <h1 className="mt-6 type-title">Stop reminder emails?</h1>
      <p className="mt-2 text-ink-soft">
        FolkBook won&apos;t email {link.data.email} about people to catch up with or birthdays.
        Password reset emails still come.
      </p>
      {stop.error && (
        <p role="alert" className="mt-3 type-small text-danger">
          {stop.error.message}
        </p>
      )}
      <Button className="mt-6 w-full" disabled={stop.isPending} onClick={() => stop.mutate()}>
        Unsubscribe
      </Button>
      <Button asChild variant="ghost" className="mt-2 w-full">
        <Link to="/">Open FolkBook</Link>
      </Button>
    </AuthFrame>
  )
}

/** "We talked" in a reminder email: log it on their timeline, for today. */
export function WeTalkedPage() {
  const { token } = useParams({ from: '/we-talked/$token' })
  const link = useQuery(talkedQuery(token))
  const log = useMutation({ mutationFn: () => logTalked(token) })
  usePageTitle('We talked')

  if (link.isPending) return <Opening />
  if (link.isError) return <Broken message={link.error.message} />

  const { person } = link.data
  const first = firstNameOf(person.name)
  const openPage = (
    <Button asChild variant={log.isSuccess ? 'secondary' : 'ghost'} className="mt-2 w-full">
      <Link to="/people/$personId" params={{ personId: person.id }}>
        Open {first}&apos;s page
      </Link>
    </Button>
  )

  if (log.isSuccess) {
    return (
      <AuthFrame>
        <h1 className="mt-6 type-title">
          {log.data.logged ? 'Logged' : 'Already on the timeline'}
        </h1>
        <p className="mt-2 text-ink-soft">
          {log.data.logged
            ? `You talked with ${person.name} today.`
            : `You'd logged today's talk with ${person.name} already.`}{' '}
          FolkBook reminds you again when it&apos;s time.
        </p>
        <div className="mt-4">{openPage}</div>
      </AuthFrame>
    )
  }
  return (
    <AuthFrame>
      <h1 className="mt-6 type-title">Log that you talked with {first}?</h1>
      <p className="mt-2 text-ink-soft">
        It goes on {first}&apos;s timeline as &ldquo;Talked&rdquo;, today, and only you see it.
      </p>
      {log.error && (
        <p role="alert" className="mt-3 type-small text-danger">
          {log.error.message}
        </p>
      )}
      <Button className="mt-6 w-full" disabled={log.isPending} onClick={() => log.mutate()}>
        Yes, we talked
      </Button>
      {openPage}
    </AuthFrame>
  )
}

function Opening() {
  return (
    <AuthFrame>
      <p className="mt-6 text-ink-soft">Opening the link…</p>
    </AuthFrame>
  )
}

function Broken({ message }: { message: string }) {
  return (
    <AuthFrame>
      <h1 className="mt-6 type-title">This link doesn&apos;t work</h1>
      <p className="mt-2 text-ink-soft">{message}</p>
      <Button asChild variant="secondary" className="mt-6 w-full">
        <Link to="/">Open FolkBook</Link>
      </Button>
    </AuthFrame>
  )
}
