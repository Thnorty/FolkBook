import { useSyncExternalStore } from 'react'

/*
 * Appearance settings for this device: color theme and motion. Kept in localStorage
 * (per device, like the OS settings they override) and applied as data attributes
 * on <html>, which the CSS reads: data-theme="light|dark", data-motion="reduce".
 * Settings → Appearance (#28) will change them with setAppearance().
 */

export type Appearance = {
  theme: 'system' | 'light' | 'dark'
  motion: 'system' | 'reduce'
}

const KEY = 'folkbook.appearance'
const DEFAULTS: Appearance = { theme: 'system', motion: 'system' }
const THEMES = ['system', 'light', 'dark']
const MOTIONS = ['system', 'reduce']

function load(): Appearance {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    if (typeof saved !== 'object' || saved === null) return DEFAULTS
    const { theme, motion } = saved as Record<string, unknown>
    return {
      theme: THEMES.includes(theme as string) ? (theme as Appearance['theme']) : DEFAULTS.theme,
      motion: MOTIONS.includes(motion as string)
        ? (motion as Appearance['motion'])
        : DEFAULTS.motion,
    }
  } catch {
    return DEFAULTS // unreadable, or storage blocked (private windows)
  }
}

function apply({ theme, motion }: Appearance) {
  const root = document.documentElement.dataset
  if (theme === 'system') delete root.theme
  else root.theme = theme
  if (motion === 'reduce') root.motion = 'reduce'
  else delete root.motion
}

let current = load()
const listeners = new Set<() => void>()

/** Apply the saved settings to the page. Call once at startup. */
export function applyAppearance() {
  current = load()
  apply(current)
}

export function setAppearance(change: Partial<Appearance>) {
  current = { ...current, ...change }
  apply(current)
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // Storage blocked: the setting still holds until the page is reloaded.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, () => current)
}
