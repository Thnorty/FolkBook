import { expect, test } from './fixtures.ts'

// A garbled or stale link shows the page's own "not found", never the server's words.
test('links to nothing say so in the app’s words', async ({ as }) => {
  const ela = await as('ela')

  await ela.goto('/people/not-a-person')
  await expect(ela.getByRole('heading', { name: 'Not in your notebook' })).toBeVisible()

  await ela.goto('/spaces/not-a-space')
  await expect(ela.getByText("This space doesn't exist, or isn't shared with you.")).toBeVisible()

  await ela.goto('/graph?focus=not-a-person')
  await expect(ela.getByText("This person isn't in your book anymore.")).toBeVisible()

  await ela.goto('/graph?how=not-a-person')
  await expect(ela.getByText("This person isn't in your book anymore.")).toBeVisible()
})
