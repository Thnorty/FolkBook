import { ACCOUNTS, unique } from './accounts.ts'
import { expect, test } from './fixtures.ts'

test("a newcomer signs up with Ela's invite link and gets a book of their own", async ({ as }) => {
  const ela = await as('ela')
  await ela.goto('/settings/invites')
  await ela.getByRole('button', { name: 'Create link' }).click()
  // The newest link comes first.
  const field = ela.getByRole('textbox', { name: 'Invite link' }).first()
  await expect(field).toHaveValue(/^http:\/\/localhost:5180\//)
  const link = await field.inputValue()

  const newcomer = await as('newcomer')
  const name = unique('Sam')
  const email = `${name.toLowerCase().replace(' ', '')}@e2e.test`
  await newcomer.goto(link)
  await expect(
    newcomer.getByRole('heading', { name: `${ACCOUNTS.ela.name} invited you` }),
  ).toBeVisible()
  await newcomer.getByLabel('Your name').fill(name)
  await newcomer.getByLabel('Email').fill(email)
  await newcomer.getByLabel('Password').fill('a long passphrase')
  await newcomer.getByRole('button', { name: 'Create account' }).click()

  await expect(newcomer.getByRole('navigation', { name: 'Main' })).toBeVisible()
  await newcomer.goto('/settings/profile')
  await expect(newcomer.getByText(name, { exact: true })).toBeVisible()
  await expect(newcomer.getByText(email, { exact: true })).toBeVisible()

  await newcomer.goto('/people')
  await expect(newcomer.getByRole('heading', { name: 'Your book is empty' })).toBeVisible()
  await expect(newcomer.getByText(ACCOUNTS.ela.name)).toHaveCount(0)
})
