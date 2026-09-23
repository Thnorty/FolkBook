import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createQueryClient } from './api/query'
import { Providers } from './app/Providers'
import './index.css'
import { applyAppearance } from './lib/appearance'
import { registerServiceWorker } from './lib/serviceWorker'
import { createAppRouter } from './router'

applyAppearance()
registerServiceWorker()
const queryClient = createQueryClient()
const router = createAppRouter(queryClient)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers queryClient={queryClient}>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
)
