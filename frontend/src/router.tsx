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
import { currentUserQuery } from './api/session'
import { AppLayout } from './app/AppLayout'
import { safeRedirect } from './lib/redirect'
import { LoginPage } from './pages/LoginPage'
import { PeoplePage } from './features/people/PeoplePage'
import { ProfilePage } from './features/person/ProfilePage'
import { validatePeopleSearch } from './features/people/search'
import { NotFoundPage } from './pages/NotFoundPage'
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
  },
  component: LoginPage,
})

/** Every page behind it needs a logged-in user; without one you land on /login. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: async ({ context, location }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery)
    if (!user) throw redirect({ to: '/login', search: { redirect: location.href } })
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

const appPages = [
  placeholder(
    '/',
    'Today',
    'Birthdays, people to get back in touch with, and a memory to refresh.',
  ),
  createRoute({
    getParentRoute: () => appRoute,
    path: 'people',
    validateSearch: validatePeopleSearch,
    component: PeoplePage,
  }),
  placeholder('people/new', 'Add person', 'A short form: name, how you met, a photo.'),
  createRoute({
    getParentRoute: () => appRoute,
    path: 'people/$personId',
    component: ProfilePage,
  }),
  placeholder(
    'people/$personId/edit',
    'Edit person',
    'Change their name, how you met, photo and details.',
  ),
  placeholder('graph', 'Graph', 'How everyone you know is connected.'),
  placeholder('spaces/new', 'New space', 'Name a space and pick its color.'),
  placeholder('spaces/$spaceId', 'Space', 'The people in this space, and who it is shared with.'),
  placeholder(
    'capture',
    'Quick capture',
    'Write what happened; AI suggests the people, notes and links to save.',
  ),
  placeholder(
    'settings',
    'Settings',
    'Your profile, appearance, AI, reminders, API keys and more.',
  ),
]

const routeTree = rootRoute.addChildren([
  loginRoute,
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
