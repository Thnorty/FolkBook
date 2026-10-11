import { unique } from './accounts.ts'
import { expect, test } from './fixtures.ts'

// The fake AI (e2e/fake-ai.mjs) runs on the same machine as the backend.
const FAKE_AI = 'http://localhost:8020/v1'

test('Ela captures someone new, undoes it, then keeps it', async ({ as }) => {
  const page = await as('ela')
  // One word, so the name is new each run: "Tom 4821" would be a "Who is “Tom”?" next time.
  const tom = unique('Tom').replace(' ', '')

  await page.goto('/settings/ai')
  const mine = page.getByRole('form', { name: 'Only for you' })
  await mine.getByText('OpenAI-compatible').click()
  await mine.getByLabel('Base URL').fill(FAKE_AI)
  await mine.getByLabel('Model').fill('fake-model')
  await mine.getByRole('button', { name: 'Test connection' }).click()
  await expect(mine.getByRole('status')).toContainText('Connected · fake-model')
  await mine.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Quick capture uses your own key')).toBeVisible()

  await page.goto('/capture')
  await page.getByLabel('What happened?').fill(`Met ${tom} at the hackathon, likes climbing`)
  await page.getByRole('button', { name: 'Suggest' }).click()

  await expect(page.getByRole('heading', { name: "Here's what I read" })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: `New person · ${tom}` })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: `Memory aid · on ${tom}` })).toBeChecked()
  await page.getByRole('button', { name: 'Save 2 items' }).click()
  await expect(page.getByText('Added 1 person and 1 memory aid.')).toBeVisible()

  // Undo all of it: Tom is gone, and the text is back to try again.
  await page.getByRole('button', { name: 'Undo all of this' }).click()
  await expect(page.getByText('Undone: 1 person and 1 memory aid')).toBeVisible()
  await expect(page.getByLabel('What happened?')).toHaveValue(
    `Met ${tom} at the hackathon, likes climbing`,
  )
  const found = await page.request.get('/api/people', { params: { search: tom } })
  expect((await found.json()).count).toBe(0)

  await page.getByRole('button', { name: 'Suggest' }).click()
  await page.getByRole('button', { name: 'Save 2 items' }).click()
  await page.getByRole('link', { name: `Open ${tom}'s page` }).click()

  await expect(page.getByRole('heading', { name: tom })).toBeVisible()
  await expect(page.getByText('Likes climbing')).toBeVisible()
})
