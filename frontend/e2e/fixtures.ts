import {
  test as base,
  expect,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test'
import { authFile, type Who } from './accounts.ts'

export { expect }

type Fixtures = {
  /** A page in a browser of its own, logged in as `who` ('newcomer' is logged out). */
  as: (who: Who | 'newcomer') => Promise<Page>
}

export const test = base.extend<Fixtures>({
  // Playwright calls the second argument `use`; named so it isn't mistaken for a React hook.
  as: async ({ browser }, provide) => {
    const contexts: BrowserContext[] = []
    await provide(async (who) => {
      // Playwright adds the project's settings (base URL, screen size, touch) itself.
      const context = await browser.newContext({
        storageState: who === 'newcomer' ? undefined : authFile(who),
      })
      contexts.push(context)
      return context.newPage()
    })
    await Promise.all(contexts.map((context) => context.close()))
  },
})

const isPhone = (testInfo: TestInfo) => testInfo.project.name === 'phone'

/** A dialog's submit button: in the sheet's header on phones, in the footer on desktop. */
export const submitButton = (
  page: Page,
  testInfo: TestInfo,
  names: { desktop: string; phone: string },
) =>
  page.getByRole('button', { name: isPhone(testInfo) ? names.phone : names.desktop, exact: true })

/** Adds someone through "Add person" (in `space`, if given) and waits for their profile. */
export async function addPerson(
  page: Page,
  testInfo: TestInfo,
  name: string,
  { space }: { space?: string } = {},
) {
  await page.goto('/people')
  // On desktop the button's name also holds its shortcut.
  await page.getByRole('button', { name: /^Add person/ }).click()
  await page.getByLabel('Name').fill(name)
  if (space) await page.getByRole('button', { name: space }).click()
  await submitButton(page, testInfo, { desktop: 'Save person', phone: 'Save' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}
