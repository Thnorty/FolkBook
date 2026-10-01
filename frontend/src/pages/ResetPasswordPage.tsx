import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { AuthFrame } from '@/components/AuthFrame'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { resetPassword, resetPreviewQuery } from '@/features/account/queries'
import { usePageTitle } from '@/lib/usePageTitle'

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** Choose a new password with a reset link (screens 7c, 7d). */
export function ResetPasswordPage() {
  const { token } = useParams({ from: '/reset/$token' })
  const link = useQuery(resetPreviewQuery(token))
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const save = useMutation({ mutationFn: () => resetPassword(token, password) })
  usePageTitle('New password')

  if (save.isSuccess) {
    return (
      <AuthFrame>
        <h1 className="mt-6 type-title">Password changed</h1>
        <p className="mt-2 text-ink-soft">
          You&apos;re signed out everywhere. Log in with your new password.
        </p>
        <Button asChild className="mt-6 w-full">
          <Link to="/login">Log in</Link>
        </Button>
      </AuthFrame>
    )
  }
  if (link.isPending) {
    return (
      <AuthFrame>
        <p className="mt-6 text-ink-soft">Opening the link…</p>
      </AuthFrame>
    )
  }
  if (link.isError) {
    return (
      <AuthFrame>
        <h1 className="mt-6 type-title">This link doesn&apos;t work</h1>
        <p className="mt-2 text-ink-soft">{link.error.message}</p>
        <p className="mt-2 text-ink-soft">Ask your admin for a new one.</p>
        <Button asChild variant="secondary" className="mt-6 w-full">
          <Link to="/login">Back to log in</Link>
        </Button>
      </AuthFrame>
    )
  }

  const matches = again.length > 0 && again === password
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (matches) save.mutate()
  }

  return (
    <AuthFrame>
      <h1 className="mt-6 type-title">Choose a new password</h1>
      <p className="mt-1.5 text-ink-soft">For {link.data.email}</p>
      <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
        <div>
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="mt-1.5 type-small text-ink-faint">At least 8 characters.</p>
        </div>
        <div>
          <Label htmlFor="again">Confirm new password</Label>
          <Input
            id="again"
            type="password"
            autoComplete="new-password"
            required
            value={again}
            aria-invalid={(again.length > 0 && !matches) || undefined}
            onChange={(event) => setAgain(event.target.value)}
          />
          {again.length > 0 && (
            <p className="mt-1.5 type-small text-ink-soft" aria-live="polite">
              {matches ? '✓ Passwords match' : "Passwords don't match yet"}
            </p>
          )}
        </div>
        <p className="type-small text-ink-soft">Saving signs you out on every other device.</p>
        {save.error && (
          <p role="alert" className="type-small text-danger">
            {save.error.message}
          </p>
        )}
        <Button type="submit" disabled={!matches || save.isPending}>
          Save new password
        </Button>
      </form>
      <p className="mt-5 type-meta text-ink-faint">
        Link works until {timeFormat.format(new Date(link.data.expires_at))}
      </p>
    </AuthFrame>
  )
}
