/**
 * Register the service worker (public/sw.js), which makes FolkBook installable and shows
 * an offline page when the server is unreachable. Only in built apps: in development it
 * would keep serving stale pages.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Not installable then, but the app works the same.
    })
  })
}
