import { useQuery } from '@tanstack/react-query'
import { useNavigate, type LinkProps } from '@tanstack/react-router'
import { Command } from 'cmdk'
import { Plus, Settings, UserPlus } from 'lucide-react'
import { Dialog } from 'radix-ui'
import type { ReactNode } from 'react'
import { Kbd } from '@/components/ui/kbd'
import { usePersonForm } from '@/features/person/usePersonForm'
import { spacesQuery } from '@/features/spaces/queries'
import type { Shortcut } from '@/lib/shortcuts'
import { SECTIONS, SHORTCUTS } from './nav'

const GROUP =
  '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:type-label [&_[cmdk-group-heading]]:text-ink-faint'

type PaletteProps = { open: boolean; onOpenChange: (open: boolean) => void }

/** Ctrl/⌘+K: jump anywhere or start an action. Searching people comes with #27. */
export function CommandPalette({ open, onOpenChange }: PaletteProps) {
  const navigate = useNavigate()
  const { openNew } = usePersonForm()
  const spaces = useQuery({ ...spacesQuery, enabled: open }).data?.items ?? []

  const go = (to: LinkProps['to'], params?: LinkProps['params']) => () => {
    onOpenChange(false)
    void navigate({ to, params })
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-30 bg-ink/25" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-[12vh] left-1/2 z-30 w-[calc(100vw-2rem)] max-w-140 -translate-x-1/2 overflow-hidden rounded-card border border-line bg-card shadow-float"
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Command loop label="Command palette">
            <Command.Input
              placeholder="Jump to a page or start something…"
              className="h-13 w-full border-b border-line bg-transparent px-4 text-base outline-none placeholder:text-ink-faint"
            />
            <Command.List className="max-h-[60vh] overflow-y-auto p-1.5">
              <Command.Empty className="px-3 py-6 text-center type-small text-ink-soft">
                Nothing matches.
              </Command.Empty>
              <Command.Group heading="Go to" className={GROUP}>
                {SECTIONS.map(({ to, label, icon: Icon }) => (
                  <Item key={to} onSelect={go(to)} icon={<Icon className="size-4" />}>
                    {label}
                  </Item>
                ))}
                <Item onSelect={go('/settings')} icon={<Settings className="size-4" />}>
                  Settings
                </Item>
              </Command.Group>
              {spaces.length > 0 && (
                <Command.Group heading="Spaces" className={GROUP}>
                  {spaces.map((space) => (
                    <Item
                      key={space.id}
                      value={`space ${space.name} ${space.id}`}
                      onSelect={go('/spaces/$spaceId', { spaceId: space.id })}
                      icon={
                        <span
                          data-space={space.color}
                          className="mx-1.5 h-3.75 w-0.75 rounded-full bg-space"
                        />
                      }
                    >
                      {space.name}
                    </Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading="Actions" className={GROUP}>
                <Item
                  onSelect={() => {
                    onOpenChange(false)
                    openNew()
                  }}
                  icon={<UserPlus className="size-4" />}
                  shortcut={SHORTCUTS.addPerson}
                >
                  Add person
                </Item>
                <Item
                  onSelect={go('/capture')}
                  icon={<Plus className="size-4" />}
                  shortcut={SHORTCUTS.quickCapture}
                >
                  Quick capture
                </Item>
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

type ItemProps = {
  children: string
  icon: ReactNode
  onSelect: () => void
  shortcut?: Shortcut
  value?: string
}

function Item({ children, icon, onSelect, shortcut, value }: ItemProps) {
  return (
    <Command.Item
      value={value ?? children}
      onSelect={onSelect}
      className="flex min-h-10 cursor-pointer items-center gap-3 rounded-tab px-2.5 text-input text-ink-soft data-[selected=true]:bg-hover data-[selected=true]:text-ink"
    >
      <span aria-hidden className="flex w-4 justify-center">
        {icon}
      </span>
      {children}
      {shortcut && <Kbd shortcut={shortcut} className="ml-auto text-ink-faint" />}
    </Command.Item>
  )
}
