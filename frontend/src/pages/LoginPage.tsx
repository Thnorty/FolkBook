import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { logIn } from '@/api/session'
import { AuthFrame } from '@/components/AuthFrame'
import { Button } from '@/components/ui/button'
import { CheckboxField } from '@/components/ui/checkbox-field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { safeRedirect } from '@/lib/redirect'
import { usePageTitle } from '@/lib/usePageTitle'

/** Log in (screen 5l). */
export function LoginPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { redirect } = useSearch({ from: '/login' })
  const [remember, setRemember] = useState(true)
  const login = useMutation({
    mutationFn: (form: FormData) =>
      logIn(queryClient, {
        email: String(form.get('email')),
        password: String(form.get('password')),
        remember: form.get('remember') === 'on',
      }),
    onSuccess: () => navigate({ href: safeRedirect(redirect), replace: true }),
  })

  usePageTitle('Log in')

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    login.mutate(new FormData(event.currentTarget))
  }

  return (
    <AuthFrame>
      <h1 className="mt-6 type-title">Log in</h1>
      <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
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
      <ForgotPassword />
    </AuthFrame>
  )
}

/**
 * Without email on this server (SMTP comes with #37), only an admin can make a reset
 * link, from Settings → Users.
 */
function ForgotPassword() {
  const [open, setOpen] = useState(false)
  return open ? (
    <p role="status" className="mt-5 type-small text-ink-soft">
      Ask your FolkBook&apos;s admin for a reset link. They can make one in Settings, under Users.
    </p>
  ) : (
    <Button variant="ghost" className="mt-3 w-full" onClick={() => setOpen(true)}>
      Forgot password?
    </Button>
  )
}
