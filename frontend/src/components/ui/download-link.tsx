import { Download } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { Button } from '@/components/ui/button'

/** A link styled as a button that downloads a file. A plain link, so the browser
 * downloads it itself, however big. */
export function DownloadLink({
  href,
  variant = 'primary',
  className,
  children,
}: {
  href: string
  variant?: ComponentProps<typeof Button>['variant']
  className?: string
  children: ReactNode
}) {
  return (
    <Button asChild variant={variant} className={className}>
      <a href={href} download>
        <Download aria-hidden />
        {children}
      </a>
    </Button>
  )
}
