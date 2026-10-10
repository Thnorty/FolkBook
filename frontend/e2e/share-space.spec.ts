import { ACCOUNTS, unique } from './accounts.ts'
import { expect, submitButton, test } from './fixtures.ts'

const NOTE = 'Private: owes me 20 euros'

test("Deniz sees the space Ela shared, and Greta, but not Ela's note", async ({ as }, testInfo) => {
  const space = unique('Climbing club')
  const greta = unique('Greta')

  const ela = await as('ela')
  await ela.goto('/spaces')
  // The sidebar has a New space button too.
  await ela.getByRole('main').getByRole('button', { name: 'New space' }).click()
  await ela.getByLabel('Name').fill(space)
  await submitButton(ela, testInfo, { desktop: 'Create space', phone: 'Create' }).click()
  await expect(ela.getByRole('heading', { name: space })).toBeVisible()

  await ela.goto('/people')
  await ela.getByRole('button', { name: /^Add person/ }).click()
  await ela.getByLabel('Name').fill(greta)
  await ela.getByRole('button', { name: space }).click()
  await submitButton(ela, testInfo, { desktop: 'Save person', phone: 'Save' }).click()
  await expect(ela.getByRole('heading', { name: greta })).toBeVisible()
  await ela.getByRole('button', { name: 'Write a note' }).click()
  await ela.getByLabel(`Notes about ${greta.split(' ')[0]}`).fill(NOTE)
  await ela.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(ela.getByText(NOTE)).toBeVisible()

  await ela.goto('/spaces')
  await ela.getByRole('main').getByRole('link', { name: space }).click()
  await ela.getByRole('button', { name: 'Share' }).click()
  await ela.getByLabel('Add people on this server').fill('Deniz')
  const accounts = ela.getByRole('list', { name: 'Accounts' })
  await expect(accounts.getByText(ACCOUNTS.deniz.name)).toBeVisible()
  await accounts.getByRole('button', { name: 'Add' }).click()
  await submitButton(ela, testInfo, { desktop: 'Share with 1 person', phone: 'Share' }).click()
  await expect(ela.getByRole('dialog')).toHaveCount(0)

  const deniz = await as('deniz')
  await deniz.goto('/spaces')
  await deniz.getByRole('main').getByRole('link', { name: space }).click()
  // "Write a note" also shows while Deniz's notes load, so wait for them before checking.
  const notesLoaded = deniz.waitForResponse(/\/api\/people\/[^/]+\/note$/)
  await deniz.getByRole('link', { name: greta }).click()
  await expect(deniz.getByRole('heading', { name: greta })).toBeVisible()
  // Deniz has notes of his own on Greta, empty so far; Ela's never show.
  await expect(deniz.getByRole('button', { name: 'Write a note' })).toBeVisible()
  expect(await (await notesLoaded).text()).not.toContain(NOTE)
  await expect(deniz.getByText(NOTE)).toHaveCount(0)
})
