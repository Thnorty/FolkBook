import { test as base, type BrowserContext, type Page, type TestInfo } from '@playwright/test'
import { authFile, type Who } from './accounts.ts'

export { expect } from '@playwright/test'

type Fixtures = {
  /** A page in a browser of its own, logged in as `who` ('newcomer' is logged out). */
  as: (who: Who | 'newcomer') => Promise<Page>
}

export const test = base.extend<Fixtures>({
  // Playwright calls the second argument `use`; named so it isn't mistaken for a React hook.
  as: async ({ browser }, provide, testInfo) => {
    const contexts: BrowserContext[] = []
    const { baseURL, viewport, isMobile, hasTouch, deviceScaleFactor } = testInfo.project.use
    await provide(async (who) => {
      const context = await browser.newContext({
        baseURL,
        viewport,
        isMobile,
        hasTouch,
        deviceScaleFactor,
        storageState: who === 'newcomer' ? undefined : authFile(who),
      })
      contexts.push(context)
      return context.newPage()
    })
    await Promise.all(contexts.map((context) => context.close()))
  },
})

export const isPhone = (testInfo: TestInfo) => testInfo.project.name === 'phone'
