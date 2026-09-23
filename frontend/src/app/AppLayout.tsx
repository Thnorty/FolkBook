import { useQuery } from '@tanstack/react-query'
import { Outlet, useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { currentUserQuery } from '@/api/session'
import { useShortcut } from '@/lib/shortcuts'
import { PageFade } from '@/motion/PageTurn'
import { BottomTabs } from './BottomTabs'
import { CommandPalette } from './CommandPalette'
import { SHORTCUTS } from './nav'
import { Sidebar } from './Sidebar'

/** The frame around every logged-in page: sidebar or bottom tabs, shortcuts, palette. */
export function AppLayout() {
  const user = useQuery(currentUserQuery).data
  const router = useRouter()
  const navigate = useNavigate()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  // The session ended (logged out here or elsewhere): run the route guard again,
  // which sends you to the login page and back here afterwards.
  useEffect(() => {
    if (user === null) void router.invalidate()
  }, [user, router])

  useShortcut(
    SHORTCUTS.palette,
    useCallback(() => setPaletteOpen((open) => !open), []),
  )
  useShortcut(
    SHORTCUTS.addPerson,
    useCallback(() => void navigate({ to: '/people/new' }), [navigate]),
  )
  useShortcut(
    SHORTCUTS.quickCapture,
    useCallback(() => void navigate({ to: '/capture' }), [navigate]),
  )

  if (!user) return null

  return (
    <div className="md:flex">
      <a
        href="#main"
        className="sr-only z-40 rounded-card bg-card px-4 py-2 shadow-float focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <Sidebar user={user} onSearch={() => setPaletteOpen(true)} />
      <main id="main" tabIndex={-1} className="min-w-0 flex-1 pb-28 outline-none md:pb-0">
        <PageFade key={pathname}>
          <Outlet />
        </PageFade>
      </main>
      <BottomTabs />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}
