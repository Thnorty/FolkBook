import { DropdownMenu } from 'radix-ui'

/**
 * Every dropdown menu's root. Not modal: an open menu doesn't lock the page's
 * scrolling, which would hide the scrollbar and shift the page while it's open.
 */
export function MenuRoot(props: DropdownMenu.DropdownMenuProps) {
  return <DropdownMenu.Root modal={false} {...props} />
}
