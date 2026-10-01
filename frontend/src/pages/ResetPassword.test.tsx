import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

function server({ usable = true } = {}) {
  const sent: unknown[] = []
  fakeServer({
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/auth/me': () => json({ detail: 'Not logged in' }, 401),
    'GET /api/auth/password-resets/tok': () =>
      usable
        ? json({ email: 'ela@example.com', expires_at: '2099-01-01T12:00:00Z' })
        : json({ detail: "This reset link has expired, was used already, or doesn't exist." }, 404),
    'POST /api/auth/password-resets/tok': async (request) => {
      sent.push(await request.json())
      return new Response(null, { status: 204 })
    },
  })
  return sent
}

afterEach(clearCookies)

describe('reset password', () => {
  it('sets a new password once both match, then sends you to log in', async () => {
    const sent = server()
    renderApp('/reset/tok')

    expect(await screen.findByText('For ela@example.com')).toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Save new password' })
    await userEvent.type(screen.getByLabelText('New password'), 'a fresh passphrase')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'a fresh pass')
    expect(screen.getByText("Passwords don't match yet")).toBeInTheDocument()
    expect(save).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'phrase')
    expect(screen.getByText('✓ Passwords match')).toBeInTheDocument()
    await userEvent.click(save)

    expect(await screen.findByRole('heading', { name: 'Password changed' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
    expect(sent).toEqual([{ password: 'a fresh passphrase' }])
  })

  it("says when the link doesn't work", async () => {
    server({ usable: false })
    renderApp('/reset/tok')

    expect(
      await screen.findByRole('heading', { name: "This link doesn't work" }),
    ).toBeInTheDocument()
    expect(screen.getByText('Ask your admin for a new one.')).toBeInTheDocument()
  })
})
