import { shortcutLabel, type Shortcut } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'

/** A shortcut hint, written the way this computer's keyboard labels it ("⌘K" or "Ctrl+K"). */
export function Kbd({ shortcut, className }: { shortcut: Shortcut; className?: string }) {
  return <kbd className={cn('type-meta normal-case', className)}>{shortcutLabel(shortcut)}</kbd>
}
