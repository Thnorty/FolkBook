import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { clearCookies, fakeServer, json } from '@/test/fakeServer'
import { renderApp } from '@/test/renderApp'

const SETTINGS = {
  nudges_on: true,
  default_interval_days: 60,
  digest: 'weekly',
  digest_weekday: 0,
  include_memory_aids: true,
  birthdays_days_before: 3,
  time_zone: 'Europe/Istanbul',
  email_ready: true,
  send_to: 'ela@example.com',
}

function server({ emailReady = true } = {}) {
  const saved: Record<string, unknown>[] = []
  const tests: string[] = []
  let settings = { ...SETTINGS, email_ready: emailReady }
  fakeServer({
    'GET /api/auth/me': () =>
      json({ id: 'u1', email: 'ela@example.com', is_admin: false, me: { id: 'me', name: 'Ela' } }),
    'GET /api/auth/csrf': () => new Response(null, { status: 204 }),
    'GET /api/keep-in-touch/settings': () => json(settings),
    'PUT /api/keep-in-touch/settings': async (request) => {
      const body = (await request.json()) as Record<string, unknown>
      saved.push(body)
      settings = { ...settings, ...body }
      return json(settings)
    },
    'POST /api/keep-in-touch/settings/test-email': () => {
      tests.push('sent')
      return json({ ok: true, message: 'Sent to ela@example.com' })
    },
  })
  return { saved, tests }
}

const page = () => screen.findByRole('region', { name: 'Reminders' })

afterEach(clearCookies)

describe('Settings → Reminders, the email digest', () => {
  it('switches to a daily digest without memory aids or birthdays', async () => {
    const { saved } = server()
    renderApp('/settings/reminders')
    const reminders = await page()

    expect(
      within(reminders).getByText(/sent to ela@example.com/, { exact: false }),
    ).toBeInTheDocument()
    expect(within(reminders).getByText(/Times are in Europe\/Istanbul/)).toBeInTheDocument()
    await userEvent.click(within(reminders).getByRole('radio', { name: 'Daily' }))
    expect(await within(reminders).findByText('Every day, 08:00')).toBeInTheDocument()
    await userEvent.click(
      within(reminders).getByRole('checkbox', { name: 'Include memory aids in emails' }),
    )
    await waitFor(() => expect(saved).toHaveLength(2))
    await userEvent.selectOptions(
      within(reminders).getByLabelText('In the email'),
      'Leave them out',
    )

    await waitFor(() => expect(saved).toHaveLength(3))
    expect(saved.at(-1)).toEqual({
      nudges_on: true,
      default_interval_days: 60,
      digest: 'daily',
      digest_weekday: 0,
      include_memory_aids: false,
      birthdays_days_before: null,
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
  })

  it('picks the day for a weekly digest', async () => {
    const { saved } = server()
    renderApp('/settings/reminders')
    const reminders = await page()

    await userEvent.selectOptions(within(reminders).getByLabelText('Day'), 'Fridays, 08:00')

    await waitFor(() => expect(saved.at(-1)).toMatchObject({ digest: 'weekly', digest_weekday: 4 }))
  })

  it('sends a test digest', async () => {
    const { tests } = server()
    renderApp('/settings/reminders')
    const reminders = await page()

    await userEvent.click(within(reminders).getByRole('button', { name: 'Send test email' }))

    expect(await within(reminders).findByText(/✓ Sent to ela@example.com · /)).toBeInTheDocument()
    expect(tests).toEqual(['sent'])
  })

  it("says when the server can't send email", async () => {
    server({ emailReady: false })
    renderApp('/settings/reminders')
    const reminders = await page()

    expect(within(reminders).getByText(/reminders only show on Today/)).toBeInTheDocument()
    expect(within(reminders).queryByRole('button', { name: 'Send test email' })).toBeNull()
  })

  it('turns the email settings off with the digest', async () => {
    server()
    renderApp('/settings/reminders')
    const reminders = await page()

    await userEvent.click(within(reminders).getByRole('radio', { name: 'Off' }))

    await waitFor(() =>
      expect(
        within(reminders).getByRole('checkbox', { name: 'Include memory aids in emails' }),
      ).toBeDisabled(),
    )
    expect(within(reminders).getByLabelText('In the email')).toBeDisabled()
  })
})
