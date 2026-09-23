import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Toaster } from '@/components/ui/toast'
import { MotionProvider } from '@/motion/MotionProvider'

/** Everything the app runs inside: server state, motion settings, toasts. */
export function Providers({
  queryClient,
  children,
}: {
  queryClient: QueryClient
  children: ReactNode
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionProvider>
        {children}
        <Toaster />
      </MotionProvider>
    </QueryClientProvider>
  )
}
