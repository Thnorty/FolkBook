import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Mail } from 'lucide-react'
import { useRef, useState, type FormEvent, type RefObject } from 'react'
import { logIn } from '@/api/session'
import { AuthFrame } from '@/components/AuthFrame'
import { Button } from '@/components/ui/button'
import { CheckboxField } from '@/components/ui/checkbox-field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { forgotPassword } from '@/features/account/queries'
import { mailStatusQuery } from '@/features/mail/queries'
import { warnAt } from '@/lib/fieldWarnings'
import { safeRedirect } from '@/lib/redirect'
import { usePageTitle } from '@/lib/usePageTitle'

/** Log in (screen 5l), and "Check your email" after asking for a reset link (7a). */
export function LoginPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { redirect } = useSearch({ from: '/login' })
  const [remember, setRemember] = useState(true)
  const emailField = useRef<HTMLInputElement>(null)
  // Where a reset link was asked for: then the page says "Check your email".
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [sends, setSends] = useState(0)
  const reset = useMutation({
    mutationFn: forgotPassword,
    onSuccess: (_, email) => {
      setSentTo(email)
      setSends((count) => count + 1)
    },
  })
  const login = useMutation({
    mutationFn: (form: FormData) =>
      logIn(queryClient, {
        email: String(form.get('email')),
        password: String(form.get('password')),
        remember: form.get('remember') === 'on',
      }),
    onSuccess: () => navigate({ href: safeRedirect(redirect), replace: true }),
  })

  usePageTitle(sentTo ? 'Check your email' : 'Log in')

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    login.mutate(new FormData(event.currentTarget))
  }

  if (sentTo) {
    return (
      <CheckYourEmail
        email={sentTo}
        sending={reset.isPending}
        sentAgain={sends > 1}
        error={reset.error?.message}
        onAgain={() => reset.mutate(sentTo)}
        onBack={() => {
          reset.reset()
          setSentTo(null)
          setSends(0)
        }}
      />
    )
  }

  return (
    <AuthFrame>
      <h1 className="mt-6 type-title">Log in</h1>
      <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            ref={emailField}
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
          />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <CheckboxField
          name="remember"
          checked={remember}
          onChange={setRemember}
          className="type-small"
        >
          Keep me logged in on this device
        </CheckboxField>
        {login.error && (
          <p role="alert" className="type-small text-danger">
            {login.error.message}
          </p>
        )}
        <Button type="submit" disabled={login.isPending}>
          {login.isPending ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
      <ForgotPassword
        emailField={emailField}
        sending={reset.isPending}
        error={reset.error?.message}
        onSend={(email) => reset.mutate(email)}
      />
    </AuthFrame>
  )
}

type ForgotPasswordProps = {
  emailField: RefObject<HTMLInputElement | null>
  sending: boolean
  error?: string
  onSend: (email: string) => void
}

/**
 * With email, it sends a reset link to the address typed above. Without, only an admin
 * can make one, from Settings → Users.
 */
function ForgotPassword({ emailField, sending, error, onSend }: ForgotPasswordProps) {
  const email = useQuery(mailStatusQuery).data
  const [askAdmin, setAskAdmin] = useState(false)

  const forgot = () => {
    const field = emailField.current
    if (!email?.ready || !field) {
      setAskAdmin(true)
    } else if (!field.value.trim() || !field.validity.valid) {
      warnAt(field, 'Type your email first.')
    } else {
      onSend(field.value.trim())
    }
  }

  if (askAdmin) {
    return (
      <p role="status" className="mt-5 type-small text-ink-soft">
        Ask your FolkBook&apos;s admin for a reset link. They can make one in Settings, under Users.
      </p>
    )
  }
  return (
    <>
      <Button variant="ghost" className="mt-3 w-full" disabled={sending} onClick={forgot}>
        {sending ? 'Sending a reset link…' : 'Forgot password?'}
      </Button>
      {error && (
        <p role="alert" className="mt-2 type-small text-danger">
          {error}
        </p>
      )}
    </>
  )
}

type CheckYourEmailProps = {
  email: string
  sending: boolean
  sentAgain: boolean
  error?: string
  onAgain: () => void
  onBack: () => void
}

/** After asking for a reset link (screen 7a). It never says whether the account exists. */
function CheckYourEmail({
  email,
  sending,
  sentAgain,
  error,
  onAgain,
  onBack,
}: CheckYourEmailProps) {
  return (
    <AuthFrame>
      <h1 className="mt-6 type-title">Check your email</h1>
      <p className="mt-1.5 text-ink-soft">
        If {email} has an account here, a reset link is on its way.
      </p>
      <div className="mt-5 flex items-start gap-3 rounded-card border border-line bg-paper p-4">
        <Mail aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-soft" />
        <p className="type-small">
          The link works once and expires in 1 hour. Check spam if it&apos;s not there in a minute.
        </p>
      </div>
      <div className="mt-5 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          ← Back to log in
        </Button>
        <Button variant="ghost" disabled={sending} onClick={onAgain}>
          {sending ? 'Sending…' : 'Send again'}
        </Button>
      </div>
      <p role="status" className={error ? 'type-small text-danger' : 'type-small text-ink-soft'}>
        {error ?? (sentAgain && !sending ? 'Sent again. Only the newest link works.' : '')}
      </p>
    </AuthFrame>
  )
}
