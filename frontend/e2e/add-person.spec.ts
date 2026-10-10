import { unique } from './accounts.ts'
import { expect, submitButton, test } from './fixtures.ts'

test('Ela adds a person and finds them again', async ({ as }, testInfo) => {
  const page = await as('ela')
  const greta = unique('Greta')

  await page.goto('/people')
  // On desktop the button's name also holds its shortcut.
  await page.getByRole('button', { name: /^Add person/ }).click()
  await page.getByLabel('Name').fill(greta)
  await page.getByLabel('How we met').fill('Climbing gym, spring 2025')
  await submitButton(page, testInfo, { desktop: 'Save person', phone: 'Save' }).click()

  await expect(page.getByRole('heading', { name: greta })).toBeVisible()
  await expect(page.getByText('Climbing gym, spring 2025')).toBeVisible()

  await page.reload()
  await page.goto('/people')
  await expect(page.getByRole('link', { name: greta })).toBeVisible()
})
