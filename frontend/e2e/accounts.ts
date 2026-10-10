/** The accounts `manage.py e2e_reset` creates, and names that don't clash between runs. */

import path from 'node:path'

export type Who = 'ela' | 'deniz'

export const ACCOUNTS: Record<Who, { email: string; name: string }> = {
  ela: { email: 'ela@e2e.test', name: 'Ela Yılmaz' },
  deniz: { email: 'deniz@e2e.test', name: 'Deniz Kaya' },
}

export const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-pass-123'

// Next to this file, whichever folder Playwright runs from.
export const authFile = (who: Who) => path.join(import.meta.dirname, '.auth', `${who}.json`)

/** "Greta 4821": tests share one database, and a retry runs on the first try's data. */
export const unique = (name: string) => `${name} ${Math.floor(1000 + Math.random() * 9000)}`
