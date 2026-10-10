import { useEffect } from 'react'

/** A keyboard shortcut: a letter, plus the platform's command key (⌘ / Ctrl) or Shift. */
export type Shortcut = { key: string; mod?: boolean; shift?: boolean }

type NavigatorWithUAData = Navigator & { userAgentData?: { platform: string } }

export function isApplePlatform(nav: Navigator = navigator): boolean {
  const platform = (nav as NavigatorWithUAData).userAgentData?.platform ?? nav.platform
  return /mac|iphone|ipad|ipod/i.test(platform)
}

/** How to show a shortcut: "⌘K" and "⇧N" on Apple devices, "Ctrl+K" and "Shift+N" elsewhere. */
const KEY_NAMES: Record<string, string> = { ArrowRight: '→', ArrowLeft: '←', Escape: 'Esc' }

export function shortcutLabel({ key, mod, shift }: Shortcut, apple = isApplePlatform()): string {
  const name = key.length === 1 ? key.toUpperCase() : (KEY_NAMES[key] ?? key) // "N", "Enter"
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
  // A symbol like "/" needs Shift on some keyboards (Shift+7 on Turkish and German ones),
  // so for those Shift doesn't matter; it still tells letters apart (N and Shift+N).
  const symbol = key.length === 1 && key.toLowerCase() === key.toUpperCase()
  return (
    event.key.toLowerCase() === key.toLowerCase() &&
    modPressed === mod &&
    (event.shiftKey === shift || (symbol && !shift)) &&
    !event.altKey &&
    !otherMod
  )
}

function inDialog(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest('[role="dialog"], [role="alertdialog"]') !== null
  )
}

type ShortcutOptions = {
  /** Ctrl/⌘ shortcuts work while typing unless this is false (e.g. Ctrl+→, which moves
   * the cursor a word in a field). Plain keys never do. */
  whileTyping?: boolean
  /** While false, the shortcut does nothing and the key is left to others. */
  enabled?: boolean
}

/**
 * Run `action` when the shortcut is pressed anywhere on the page. Plain-key shortcuts are
 * ignored while typing in a field, and inside an open dialog (its keys are its own);
 * ones with ⌘/Ctrl work everywhere, unless `whileTyping` is false.
 */
export function useShortcut(
  shortcut: Shortcut,
  action: () => void,
  { whileTyping = true, enabled = true }: ShortcutOptions = {},
) {
  const { key, mod, shift } = shortcut
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return
      if (!matches(event, { key, mod, shift })) return
      const typing = isTyping(event.target)
      if (!mod && (typing || inDialog(event.target))) return
      if (mod && typing && !whileTyping) return
      event.preventDefault()
      action()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [key, mod, shift, action, whileTyping, enabled])
}
