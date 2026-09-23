import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import { createQueryClient } from '@/api/query'
import { Providers } from '@/app/Providers'
import { createAppRouter } from '@/router'

/** Renders the whole app (router, guards, shell) at `path`. Pair it with fakeServer. */
export function renderApp(path: string) {
  const queryClient = createQueryClient()
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [path] }))
  render(
    <Providers queryClient={queryClient}>
      <RouterProvider router={router} />
    </Providers>,
  )
  return router
}
