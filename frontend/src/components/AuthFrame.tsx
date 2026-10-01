import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Logo } from '@/app/Logo'
import { aboutQuery } from '@/features/settings/queries'
import { cn } from '@/lib/utils'

type AuthFrameProps = {
  children: ReactNode
  /** Wider, for pages with more beside the form (an invite's space). */
  wide?: boolean
}

/**
 * The frame around the pages before you're in: log in, first run, invites, password
 * reset (screens 5e–5l, 7c). A card on desktop, the plain page on phones, and this
 * server's address underneath.
 */
export function AuthFrame({ children, wide = false }: AuthFrameProps) {
  const about = useQuery(aboutQuery).data // the AGPL: anyone using the server gets its source
  return (
    <main className="flex min-h-dvh flex-col items-center px-4 py-16 md:justify-center">
      <div
        className={cn(
          'w-full md:rounded-card md:border md:border-line md:bg-card md:p-8 md:shadow-paper',
          wide ? 'max-w-3xl' : 'max-w-sm',
        )}
      >
        <Logo />
        {children}
      </div>
      <p className="mt-6 flex gap-3 type-meta text-ink-faint">
        {window.location.host}
        {about && (
          <a href={about.source_url} target="_blank" rel="noreferrer" className="hover:text-ink">
            Source code
          </a>
        )}
      </p>
    </main>
  )
}
