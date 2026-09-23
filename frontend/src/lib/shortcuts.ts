import { useEffect } from 'react'

/** A keyboard shortcut: a letter, plus the platform's command key (⌘ / Ctrl) or Shift. */
export type Shortcut = { key: string; mod?: boolean; shift?: boolean }

type NavigatorWithUAData = Navigator & { userAgentData?: { platform: string } }

export function isApplePlatform(nav: Navigator = navigator): boolean {
  const platform = (nav as NavigatorWithUAData).userAgentData?.platform ?? nav.platform
  return /mac|iphone|ipad|ipod/i.test(platform)
}

/** How to show a shortcut: "⌘K" and "⇧N" on Apple devices, "Ctrl+K" and "Shift+N" elsewhere. */
export function shortcutLabel({ key, mod, shift }: Shortcut, apple = isApplePlatform()): string {
  const name = key.length === 1 ? key.toUpperCase() : key // "N", but "Enter"
  const parts = [mod && (apple ? '⌘' : 'Ctrl'), shift && (apple ? '⇧' : 'Shift'), name]
  return parts.filter(Boolean).join(apple ? '' : '+')
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function matches(event: KeyboardEvent, { key, mod = false, shift = false }: Shortcut) {
  const modPressed = isApplePlatform() ? event.metaKey : event.ctrlKey
  const otherMod = isApplePlatform() ? event.ctrlKey : event.metaKey
  return (
    event.key.toLowerCase() === key.toLowerCase() &&
    modPressed === mod &&
    event.shiftKey === shift &&
    !event.altKey &&
    !otherMod
  )
}

/**
 * Run `action` when the shortcut is pressed anywhere on the page. Plain-letter shortcuts
 * are ignored while typing in a field; ones with ⌘/Ctrl work everywhere.
 */
export function useShortcut(shortcut: Shortcut, action: () => void) {
  const { key, mod, shift } = shortcut
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return
      if (!matches(event, { key, mod, shift })) return
      if (!mod && isTyping(event.target)) return
      event.preventDefault()
      action()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [key, mod, shift, action])
}
