import { existsSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from '@playwright/test'
import { PASSWORD } from './e2e/accounts.ts'

// The tests run the real app on ports and a database of their own, so they never touch
// the dev servers or the dev book.
const API = 'http://localhost:8010'
const APP = 'http://localhost:5180'
// Locally the backend reads its settings from .env (CI sets them in the job). Variables
// already in the environment win over the file, so POSTGRES_DB below always applies.
// Looked up from this file, not the shell, so `-c frontend/playwright.config.ts` works too.
const envFile = existsSync(path.join(import.meta.dirname, '../.env')) ? '--env-file ../.env' : ''

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: { baseURL: APP, trace: 'retain-on-failure' },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'desktop',
      use: { viewport: { width: 1280, height: 900 } },
      dependencies: ['setup'],
    },
    {
      name: 'phone',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
      dependencies: ['setup'],
    },
  ],
  webServer: [
    {
      cwd: '../backend',
      command: `uv run ${envFile} python manage.py e2e_reset && uv run ${envFile} python manage.py runserver 8010 --noreload`,
      env: { POSTGRES_DB: 'folkbook_e2e', E2E_PASSWORD: PASSWORD },
      url: `${API}/api/about`,
      stdout: 'pipe',
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: 'npx vite build && npx vite preview --port 5180 --strictPort',
      env: { FOLKBOOK_API: API },
      url: APP,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
})
