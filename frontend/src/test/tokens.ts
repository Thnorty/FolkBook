/// <reference types="node" />
import { readFileSync } from 'node:fs'

/* The design tokens as written in src/styles/tokens.css, for tests that check them. */

export type Mode = 'light' | 'dark'

// Read from disk: Vitest doesn't load CSS imports, not even ?raw.
const css = readFileSync('src/styles/tokens.css', 'utf8')
const tokens = new Map<string, Record<Mode, string>>()
for (const [, name, value] of css.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
  const pair = value.match(/^light-dark\((.+), (.+)\)$/)
  tokens.set(name, pair ? { light: pair[1], dark: pair[2] } : { light: value, dark: value })
}

/** A token's value in one theme, e.g. token('paper', 'dark') → "#1e1b17". */
export function token(name: string, mode: Mode): string {
  const value = tokens.get(name)
  if (!value) throw new Error(`No token --${name}`)
  return value[mode]
}
