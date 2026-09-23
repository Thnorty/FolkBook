/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * WCAG AA contrast for every text/background pair the components use, in both themes.
 * Reads the real token values from tokens.css, so a color change can't slip below AA.
 */

type Rgba = [number, number, number, number]
type Mode = 'light' | 'dark'

const TEXT = 4.5 // AA, normal text
const UI = 3 // AA, input borders and focus outlines

function parseColor(value: string): Rgba {
  const hex = value.match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
  }
  const rgb = value.match(/^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)$/)
  if (rgb) return [+rgb[1], +rgb[2], +rgb[3], +rgb[4]]
  throw new Error(`Can't read color ${value}`)
}

// Read from disk: Vitest doesn't load CSS imports, not even ?raw.
const css = readFileSync('src/styles/tokens.css', 'utf8')
const tokens = new Map<string, Record<Mode, string>>()
for (const [, name, value] of css.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
  const pair = value.match(/^light-dark\((.+), (.+)\)$/)
  tokens.set(name, pair ? { light: pair[1], dark: pair[2] } : { light: value, dark: value })
}

function color(name: string, mode: Mode): Rgba {
  const token = tokens.get(name)
  if (!token) throw new Error(`No token --${name}`)
  return parseColor(token[mode])
}

/** `top` painted over an opaque `bottom`, like a translucent fill on paper. */
function over(top: Rgba, bottom: Rgba, alpha = top[3]): Rgba {
  return [0, 1, 2].map((i) => top[i] * alpha + bottom[i] * (1 - alpha)).concat(1) as Rgba
}

function luminance([r, g, b]: Rgba): number {
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(foreground: Rgba, background: Rgba): number {
  const [a, b] = [luminance(over(foreground, background)), luminance(background)]
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

const SPACES = ['sage', 'ochre', 'clay', 'plum', 'teal', 'slate']
const NOTES = ['yellow', 'pink', 'green', 'blue']
const TAB_TINT = 0.24 // bg-space/24 in SpaceTab

type Check = [label: string, fg: (m: Mode) => Rgba, bg: (m: Mode) => Rgba, min: number]
const on = (fg: string, bg: string, min = TEXT): Check => [
  `${fg} on ${bg}`,
  (m) => color(fg, m),
  (m) => color(bg, m),
  min,
]

const checks: Check[] = [
  ...['ink', 'ink-soft', 'ink-faint', 'accent', 'danger'].flatMap((fg) => [
    on(fg, 'paper'),
    on(fg, 'card'),
  ]),
  on('on-accent', 'accent'),
  on('on-inverse', 'inverse'),
  on('on-inverse-soft', 'inverse'),
  on('inverse-accent', 'inverse'),
  on('photo-caption', 'photo-frame'),
  on('line-input', 'card', UI),
  on('line-input', 'paper', UI),
  on('accent', 'paper', UI),
  ...SPACES.map((space) => on('on-space', `space-${space}`)),
  ...SPACES.map((space): Check => [
    `space-${space}-ink on its tinted tab`,
    (m) => color(`space-${space}-ink`, m),
    (m) => over(color(`space-${space}`, m), color('paper', m), TAB_TINT),
    TEXT,
  ]),
  ...NOTES.map((note) => on('note-ink', `note-${note}`)),
]

describe.each<Mode>(['light', 'dark'])('%s theme contrast', (mode) => {
  it.each(checks)('%s', (_, fg, bg, min) => {
    const background = over(bg(mode), color('paper', mode))
    expect(contrast(fg(mode), background)).toBeGreaterThanOrEqual(min)
  })
})
