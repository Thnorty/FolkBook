import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import type { CurrentUser } from '@/api/session'
import { logOut } from '@/api/session'
import { notify } from '@/lib/notify'

const ITEM =
  'flex min-h-10 cursor-pointer items-center rounded-tab px-3 text-md outline-none select-none data-highlighted:bg-hover'

/** Your name at the foot of the sidebar; opens Settings and Log out. */
export function UserMenu({ user }: { user: CurrentUser }) {
  const queryClient = useQueryClient()
  const name = user.me?.name ?? user.email

  const signOut = () =>
    logOut(queryClient).catch((error: Error) => notify({ title: error.message }))

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex w-full cursor-pointer items-center gap-2.5 rounded-card px-1.5 py-1.5 text-left hover:bg-hover">
        <span
          aria-hidden
          className="size-6.5 flex-none rounded-full border border-line-strong photo-empty"
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{name} (me)</span>
        <ChevronDown aria-hidden className="size-3.5 text-ink-faint" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={6}
          className="z-20 min-w-52 rounded-card border border-line bg-card p-1 shadow-float"
        >
          <DropdownMenu.Item asChild className={ITEM}>
            <Link to="/settings">Settings</Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item className={ITEM} onSelect={signOut}>
            Log out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
