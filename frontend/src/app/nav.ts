import type { Shortcut } from '@/lib/shortcuts'
import { GraphIcon, PeopleIcon, TodayIcon } from './icons'

/** The main sections, in the order both the sidebar and the bottom tabs show them. */
export const SECTIONS = [
  { to: '/', label: 'Today', icon: TodayIcon },
  { to: '/people', label: 'People', icon: PeopleIcon },
  { to: '/graph', label: 'Graph', icon: GraphIcon },
] as const

export const SHORTCUTS = {
  addPerson: { key: 'n' },
  quickCapture: { key: 'n', shift: true },
  palette: { key: 'k', mod: true },
  logInteraction: { key: 'l' }, // on someone's profile
} satisfies Record<string, Shortcut>
