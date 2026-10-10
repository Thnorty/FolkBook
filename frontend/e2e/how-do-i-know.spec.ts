import type { Page, TestInfo } from '@playwright/test'
import { ACCOUNTS, unique } from './accounts.ts'
import { addPerson, expect, submitButton, test } from './fixtures.ts'

/** On someone's profile: connect them to `other` as `kind` (the Connect dialog). */
async function connect(page: Page, testInfo: TestInfo, other: string, kind: string) {
  await page
    .getByRole('region', { name: 'Connections' })
    .getByRole('button', { name: 'Add' })
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Who?').fill(other)
  // Exactly: the list also offers "Create “…” as a new person".
  await dialog
    .getByRole('list', { name: 'People' })
    .getByRole('button', { name: other, exact: true })
    .click()
  // The kinds are radio buttons drawn as chips: their labels take the click.
  await dialog.getByText(kind, { exact: true }).click()
  await submitButton(page, testInfo, { desktop: 'Connect them', phone: 'Connect' }).click()
  await expect(dialog).toHaveCount(0)
}

test('Ela finds how she knows Tom, from the graph and from a profile', async ({ as }, testInfo) => {
  const emma = unique('Emma')
  const tom = unique('Tom')

  const ela = await as('ela')
  await addPerson(ela, testInfo, tom)
  await addPerson(ela, testInfo, emma)
  const emmasProfile = ela.url()
  await connect(ela, testInfo, ACCOUNTS.ela.name, 'Friend')
  await connect(ela, testInfo, tom, 'Cousin')

  await ela.goto('/graph')
  const box = ela.getByLabel('How do I know…?')
  await expect(box).toBeVisible() // the graph page loads on demand
  // Desktop has the / shortcut; on phones you tap the box.
  if (testInfo.project.name === 'phone') await box.click()
  else await ela.keyboard.press('/')
  await expect(box).toBeFocused()
  await box.fill(tom)
  await ela.getByRole('list', { name: 'People' }).getByRole('button', { name: tom }).click()

  const route = ela.getByRole('region', { name: 'How you know Tom' })
  await expect(route).toContainText('How you know Tom · 2 steps')
  await expect(route.getByRole('list', { name: 'Steps' })).toContainText('friend')
  await expect(route.getByRole('list', { name: 'Steps' })).toContainText('cousin')
  await route.getByRole('button', { name: 'Clear' }).click()
  await expect(route).toHaveCount(0)

  await ela.goto(emmasProfile)
  await ela.getByRole('link', { name: 'How do I know Emma?' }).click()
  await expect(ela.getByRole('region', { name: 'How you know Emma' })).toContainText(
    'How you know Emma · 1 step',
  )
})
