import { test as base, type BrowserContext, type Page, type TestInfo } from '@playwright/test'
import { authFile, type Who } from './accounts.ts'

export { expect } from '@playwright/test'

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
