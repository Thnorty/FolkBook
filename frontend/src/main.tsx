import { QueryClientProvider } from '@tanstack/react-query'
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { createQueryClient } from './api/query'
import { Toaster } from './components/ui/toast'
import './index.css'
import App from './App.tsx'

const queryClient = createQueryClient()

// The design system page exists only in development; the build drops it.
const DesignSystem = import.meta.env.DEV ? lazy(() => import('./design/DesignSystem')) : null
const page =
  DesignSystem && location.pathname === '/design' ? (
    <Suspense>
      <DesignSystem />
    </Suspense>
  ) : (
    <App />
  )

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {page}
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
)
