/**
 * Where to go after logging in. Only paths on this site are allowed, so a crafted
 * link like /login?redirect=https://evil.example can't send someone elsewhere.
 */
export function safeRedirect(target: unknown): string {
  if (typeof target !== 'string' || !target.startsWith('/')) return '/'
  if (target.startsWith('//') || target.startsWith('/\\')) return '/'
  return target
}
