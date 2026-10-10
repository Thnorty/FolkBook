import { test as setup, expect } from '@playwright/test'
import { ACCOUNTS, authFile, PASSWORD, type Who } from './accounts.ts'

// Log each account in once through the real login page; the tests reuse the sessions.
for (const who of Object.keys(ACCOUNTS) as Who[]) {
  setup(`log in as ${who}`, async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(ACCOUNTS[who].email)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await page.context().storageState({ path: authFile(who) })
  })
}
