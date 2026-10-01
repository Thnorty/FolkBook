import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router'
import { currentUserQuery, setupStatusQuery } from './api/session'
import { AppLayout } from './app/AppLayout'
import { safeRedirect } from './lib/redirect'
import { LoginPage } from './pages/LoginPage'
import { PeoplePage } from './features/people/PeoplePage'
import { ProfilePage } from './features/person/ProfilePage'
import { SpacePage } from './features/spaces/SpacePage'
import { SpacesPage } from './features/spaces/SpacesPage'
import { TodayPage } from './features/today/TodayPage'
import {
  AboutSettings,
  AppearanceSettings,
  ReminderSettingsPage,
} from './features/settings/OtherSettings'
import { InvitesSettings, UsersSettings } from './features/settings/AdminSettings'
import { ProfileSettings } from './features/settings/ProfileSettings'
import { SettingsLayout } from './features/settings/SettingsLayout'
import { validatePeopleSearch } from './features/people/search'
import { InvitePage } from './pages/InvitePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { SearchPage } from './pages/SearchPage'
import { SetupPage } from './pages/SetupPage'
import { PlaceholderPage } from './pages/PlaceholderPage'

type RouterContext = { queryClient: QueryClient }

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: NotFoundPage,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'login',
  validateSearch: (search): { redirect?: string } =>
    typeof search.redirect === 'string' ? { redirect: search.redirect } : {},
  beforeLoad: async ({ context, search }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery)
    if (user) throw redirect({ href: safeRedirect(search.redirect) })
    await needsNoSetup(context.queryClient)
  },
  component: LoginPage,
})

/** A brand-new server has no accounts yet: everything leads to the first run. */
async function needsNoSetup(queryClient: QueryClient) {
  // If the check itself fails, logging in is still the better guess than a setup page.
  const { needed } = await queryClient
    .ensureQueryData(setupStatusQuery)
    .catch(() => ({ needed: false }))
  if (needed) throw redirect({ to: '/setup' })
}

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'setup',
  beforeLoad: async ({ context }) => {
    const { needed } = await context.queryClient.ensureQueryData(setupStatusQuery)
    if (!needed) throw redirect({ to: '/' })
  },
  component: SetupPage,
})

/** Every page behind it needs a logged-in user; without one you land on /login. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: async ({ context, location }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery)
    if (!user) {
      await needsNoSetup(context.queryClient)
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
  },
  component: AppLayout,
})

/** A logged-in page that isn't built yet. `note` says what it will hold. */
function placeholder<const Path extends string>(path: Path, title: string, note: string) {
  return createRoute({
    getParentRoute: () => appRoute,
    path,
    component: () => <PlaceholderPage title={title} note={note} />,
  })
}

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'settings',
  component: SettingsLayout,
})

const settingsTree = settingsRoute.addChildren([
  // Phones list the sections here; desktop shows the first one beside the list.
  createRoute({ getParentRoute: () => settingsRoute, path: '/', component: ProfileSettings }),
  createRoute({
    getParentRoute: () => settingsRoute,
    path: 'profile',
    component: ProfileSettings,
  }),
  createRoute({
    getParentRoute: () => settingsRoute,
    path: 'reminders',
    component: ReminderSettingsPage,
  }),
  createRoute({
    getParentRoute: () => settingsRoute,
    path: 'appearance',
    component: AppearanceSettings,
  }),
  createRoute({ getParentRoute: () => settingsRoute, path: 'about', component: AboutSettings }),
  createRoute({ getParentRoute: () => settingsRoute, path: 'users', component: UsersSettings }),
  createRoute({ getParentRoute: () => settingsRoute, path: 'invites', component: InvitesSettings }),
])

const appPages = [
  createRoute({ getParentRoute: () => appRoute, path: '/', component: TodayPage }),
  createRoute({
    getParentRoute: () => appRoute,
    path: 'people',
    validateSearch: validatePeopleSearch,
    component: PeoplePage,
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: 'people/$personId',
    component: ProfilePage,
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: 'graph',
    // Loaded when opened: the WebGL graph (Reagraph, three.js) is most of the app's size.
    component: lazyRouteComponent(() => import('./features/graph/GraphPage'), 'GraphPage'),
  }),
  createRoute({ getParentRoute: () => appRoute, path: 'search', component: SearchPage }),
  createRoute({ getParentRoute: () => appRoute, path: 'spaces', component: SpacesPage }),
  createRoute({ getParentRoute: () => appRoute, path: 'spaces/$spaceId', component: SpacePage }),
  placeholder(
    'capture',
    'Quick capture',
    'Write what happened; AI suggests the people, notes and links to save.',
  ),
  settingsTree,
]

/** An invite link: open to anyone who has it, logged in or not. */
const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'i/$token',
  component: InvitePage,
})

/** A password reset link: open to anyone who has it. */
const resetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'reset/$token',
  component: ResetPasswordPage,
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  setupRoute,
  inviteRoute,
  resetRoute,
  appRoute.addChildren(appPages),
  // The design system page, only while developing (the build leaves it out).
  ...(import.meta.env.DEV
    ? [
        createRoute({
          getParentRoute: () => rootRoute,
          path: 'design',
          component: lazyRouteComponent(() => import('./design/DesignSystem')),
        }),
      ]
    : []),
])

export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
  return createRouter({
    routeTree,
    history,
    context: { queryClient },
    defaultPreload: 'intent',
    scrollRestoration: true,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
