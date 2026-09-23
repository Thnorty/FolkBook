import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { SECTIONS } from './nav'

const TAB =
  'flex w-13 flex-col items-center gap-0.75 text-2xs font-medium text-ink-faint data-[status=active]:font-semibold data-[status=active]:text-accent'

/** The phone tab bar (screen 1e): Today · People · + · Graph · Me. Hidden from md up. */
export function BottomTabs() {
  const [today, people, graph] = SECTIONS

  const tab = ({ to, label, icon: Icon }: (typeof SECTIONS)[number]) => (
    <Link to={to} activeOptions={{ exact: to === '/' }} className={TAB}>
      <Icon className="size-5" />
      {label}
    </Link>
  )

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-between border-t border-line bg-chrome px-5.5 pt-2 pb-[max(--spacing(3.5),env(safe-area-inset-bottom))] md:hidden"
    >
      {tab(today)}
      {tab(people)}
      <Link
        to="/capture"
        aria-label="Quick capture"
        className="-mt-4 flex size-13 items-center justify-center rounded-full bg-accent text-on-accent shadow-float"
      >
        <Plus aria-hidden className="size-6.5" />
      </Link>
      {tab(graph)}
      <Link to="/settings" className={TAB}>
        <span aria-hidden className="size-5.5 rounded-full border border-line-strong photo-empty" />
        Me
      </Link>
    </nav>
  )
}
