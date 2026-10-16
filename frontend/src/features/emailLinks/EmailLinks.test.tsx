import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

const BROKEN = { detail: "This link doesn't work anymore. Open FolkBook to do it there." }

function server({ works = true, subscribed = true, logged = true } = {}) {
  const posts: string[] = []
  fakeServer({
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/auth/me': () => json({ detail: 'Not logged in' }, 401),
    'GET /api/email-links/unsubscribe/tok': () =>
      works ? json({ email: 'ela@example.com', subscribed }) : json(BROKEN, 404),
    'POST /api/email-links/unsubscribe/tok': () => {
      posts.push('unsubscribe')
      return new Response(null, { status: 204 })
    },
    'GET /api/email-links/we-talked/tok': () =>
      works ? json({ person: { id: 'p1', name: 'Deniz Arslan' } }) : json(BROKEN, 404),
    'POST /api/email-links/we-talked/tok': () => {
      posts.push('talked')
      return json({ logged })
    },
  })
  return posts
}

afterEach(clearCookies)

describe('unsubscribe link', () => {
  it('asks first, then stops the emails', async () => {
    const posts = server()
    renderApp('/unsubscribe/tok')

    expect(
      await screen.findByRole('heading', { name: 'Stop reminder emails?' }),
    ).toBeInTheDocument()
    expect(posts).toEqual([]) // opening the link changed nothing
    await userEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }))

    expect(await screen.findByRole('heading', { name: "You're unsubscribed" })).toBeInTheDocument()
    expect(screen.getByText(/No more reminder emails to ela@example.com/)).toBeInTheDocument()
    expect(posts).toEqual(['unsubscribe'])
  })

  it('says so when already unsubscribed', async () => {
    const posts = server({ subscribed: false })
    renderApp('/unsubscribe/tok')

    expect(await screen.findByRole('heading', { name: "You're unsubscribed" })).toBeInTheDocument()
    expect(posts).toEqual([])
  })

  it("says when the link doesn't work", async () => {
    server({ works: false })
    renderApp('/unsubscribe/tok')

    expect(
      await screen.findByRole('heading', { name: "This link doesn't work" }),
    ).toBeInTheDocument()
    expect(screen.getByText(BROKEN.detail)).toBeInTheDocument()
  })
})

describe('we talked link', () => {
  it('asks first, then logs it', async () => {
    const posts = server()
    renderApp('/we-talked/tok')

    expect(
      await screen.findByRole('heading', { name: 'Log that you talked with Deniz?' }),
    ).toBeInTheDocument()
    expect(posts).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: 'Yes, we talked' }))

    expect(await screen.findByRole('heading', { name: 'Logged' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: "Open Deniz's page" })).toHaveAttribute(
      'href',
      '/people/p1',
    )
    expect(posts).toEqual(['talked'])
  })

  it("says when today's talk was already logged", async () => {
    server({ logged: false })
    renderApp('/we-talked/tok')

    await userEvent.click(await screen.findByRole('button', { name: 'Yes, we talked' }))

    expect(
      await screen.findByRole('heading', { name: 'Already on the timeline' }),
    ).toBeInTheDocument()
  })
})
