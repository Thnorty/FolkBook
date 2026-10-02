import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { FieldWarnings } from '@/components/ui/field-warning'
import { Toaster } from '@/components/ui/toast'
import { TooltipProvider } from '@/components/ui/tooltip'
import { MotionProvider } from '@/motion/MotionProvider'

/** Everything the app runs inside: server state, motion settings, toasts, form warnings. */
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
        <TooltipProvider>
          {children}
          <Toaster />
          <FieldWarnings />
        </TooltipProvider>
      </MotionProvider>
    </QueryClientProvider>
  )
}
