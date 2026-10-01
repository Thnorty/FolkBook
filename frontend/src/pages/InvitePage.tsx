import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { acceptInvite, currentUserQuery } from '@/api/session'
import { AuthFrame } from '@/components/AuthFrame'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { invitePreviewQuery, joinWithInvite, type InvitePreview } from '@/features/invites/queries'
import { peopleCount } from '@/features/spaces/labels'
import { formatRelativeDay, isoDay } from '@/lib/dates'
import { usePageTitle } from '@/lib/usePageTitle'

/** Opening an invite link: sign up with it, or join its space if you have an account (5j, 5k). */
export function InvitePage() {
  const { token } = useParams({ from: '/i/$token' })
  const invite = useQuery(invitePreviewQuery(token))
  const user = useQuery(currentUserQuery).data
  usePageTitle('Invite')

  if (invite.isPending) {
    return (
      <AuthFrame>
        <p className="mt-6 text-ink-soft">Opening the invite…</p>
      </AuthFrame>
    )
  }
  if (invite.isError) {
    return (
      <AuthFrame>
        <h1 className="mt-6 type-title">This link doesn&apos;t work</h1>
        <p className="mt-2 text-ink-soft">{invite.error.message}</p>
        <p className="mt-2 text-ink-soft">Ask whoever sent it for a new one.</p>
        <Button asChild variant="secondary" className="mt-6 w-full">
          <Link to="/login">Log in</Link>
        </Button>
      </AuthFrame>
    )
  }

  const data = invite.data
  return (
    <AuthFrame wide>
      <div className="mt-6 flex flex-col gap-8 md:flex-row">
        <About invite={data} />
        <div className="md:w-80 md:flex-none">
          {user ? <Join token={token} invite={data} /> : <SignUp token={token} invite={data} />}
        </div>
      </div>
    </AuthFrame>
  )
}

function About({ invite }: { invite: InvitePreview }) {
  return (
    <div className="flex-1">
      <h1 className="type-title">{invite.invited_by} invited you</h1>
      <p className="mt-1 text-ink-soft">to the FolkBook on {window.location.host}</p>
      {invite.space && (
        <div className="mt-5" data-space={invite.space.color}>
          <span className="inline-block rounded-t-tab bg-space px-3 py-1.5 text-md font-medium text-on-space">
            {invite.space.name}
          </span>
          <div className="rounded-b-card border border-line bg-paper p-4 shadow-ribbon">
            <p className="type-heading">
              {invite.invited_by} shared {invite.space.name} with you
            </p>
            <p className="mt-1 type-small text-ink-soft">
              {peopleCount(invite.space_people_count ?? 0)} · you&apos;ll be{' '}
              {invite.role === 'editor' ? 'an editor' : 'a viewer'}
            </p>
          </div>
        </div>
      )}
      <p className="mt-5 type-meta text-ink-faint">
        Link expires {formatRelativeDay(isoDay(0, new Date(invite.expires_at)))}
      </p>
    </div>
  )
}

function SignUp({ token, invite }: { token: string; invite: InvitePreview }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const signUp = useMutation({
    mutationFn: (form: FormData) =>
      acceptInvite(queryClient, token, {
        name: String(form.get('name')).trim(),
        email: String(form.get('email')).trim(),
        password: String(form.get('password')),
      }),
    onSuccess: () =>
      navigate(
        invite.space
          ? { to: '/spaces/$spaceId', params: { spaceId: invite.space.id }, replace: true }
          : { to: '/', replace: true },
      ),
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    signUp.mutate(new FormData(event.currentTarget))
  }

  return (
    <>
      <h2 className="type-heading">Create your account</h2>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <div>
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" autoComplete="name" required maxLength={200} />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="username" required />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <p className="mt-1.5 type-small text-ink-faint">At least 8 characters.</p>
        </div>
        {signUp.error && (
          <p role="alert" className="type-small text-danger">
            {signUp.error.message}
          </p>
        )}
        <Button type="submit" disabled={signUp.isPending}>
          {invite.space ? 'Create account & join' : 'Create account'}
        </Button>
      </form>
      <p className="mt-4 type-small text-ink-soft">
        Your notes and memory aids are private.
        {invite.space && ` ${invite.invited_by} only sees what you add to the space.`}
      </p>
      <p className="mt-4 type-small text-ink-soft">
        Already have an account?{' '}
        <Link
          to="/login"
          search={{ redirect: `/i/${token}` }}
          className="font-medium text-accent hover:underline"
        >
          {invite.space ? 'Log in and join' : 'Log in'}
        </Link>
      </p>
    </>
  )
}

/** Logged in already: join the invite's space with this account. */
function Join({ token, invite }: { token: string; invite: InvitePreview }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const join = useMutation({
    mutationFn: () => joinWithInvite(queryClient, token),
    onSuccess: (space) =>
      navigate({ to: '/spaces/$spaceId', params: { spaceId: space.id }, replace: true }),
  })

  if (!invite.space) {
    return (
      <>
        <h2 className="type-heading">You already have an account</h2>
        <p className="mt-2 type-small text-ink-soft">This invite is for people new to FolkBook.</p>
        <Button asChild className="mt-4 w-full">
          <Link to="/">Open FolkBook</Link>
        </Button>
      </>
    )
  }
  return (
    <>
      <h2 className="type-heading">Join {invite.space.name}</h2>
      <p className="mt-2 type-small text-ink-soft">
        With the account you&apos;re logged in with. Your notes and memory aids stay private.
      </p>
      {join.error && (
        <p role="alert" className="mt-3 type-small text-danger">
          {join.error.message}
        </p>
      )}
      <Button className="mt-4 w-full" disabled={join.isPending} onClick={() => join.mutate()}>
        Join {invite.space.name}
      </Button>
    </>
  )
}
