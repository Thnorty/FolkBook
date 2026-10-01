import { Dialog } from 'radix-ui'
import { SearchCommand } from './SearchCommand'

type PaletteProps = { open: boolean; onOpenChange: (open: boolean) => void }

/** Ctrl/⌘+K: search everything you can see, jump to a page or start something. */
export function CommandPalette({ open, onOpenChange }: PaletteProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-30 bg-ink/25" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-[12vh] left-1/2 z-30 w-[calc(100vw-2rem)] max-w-140 -translate-x-1/2 overflow-hidden rounded-card border border-line bg-card shadow-float"
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <SearchCommand onDone={() => onOpenChange(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
