import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { logIn } from '@/api/session'
import { Logo } from '@/app/Logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { safeRedirect } from '@/lib/redirect'
import { usePageTitle } from '@/lib/usePageTitle'

/** Log in (screen 5l). First run, invites and password reset come with #16. */
export function LoginPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { redirect } = useSearch({ from: '/login' })
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
    <main className="flex min-h-dvh items-start justify-center px-4 py-16 md:items-center">
      <div className="w-full max-w-sm md:rounded-card md:border md:border-line md:bg-card md:p-8 md:shadow-paper">
        <Logo />
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
          <label className="flex items-center gap-2.5 type-small">
            <input
              name="remember"
              type="checkbox"
              defaultChecked
              className="size-4 accent-accent"
            />
            Keep me logged in on this device
          </label>
          {login.error && (
            <p role="alert" className="type-small text-danger">
              {login.error.message}
            </p>
          )}
          <Button type="submit" disabled={login.isPending}>
            {login.isPending ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
      </div>
    </main>
  )
}
