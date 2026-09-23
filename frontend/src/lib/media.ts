/** True from the `md` breakpoint (768px) up, where the sidebar and side panels show. */
export function isWideScreen(): boolean {
  return window.matchMedia?.('(min-width: 768px)').matches ?? false
}
