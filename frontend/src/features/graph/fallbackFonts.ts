/**
 * Where the graph's labels get fonts for names outside the label font (Cyrillic, Greek,
 * Arabic, CJK, emoji…): FolkBook's own copy in public/graph-fonts (`npm run graph-fonts`),
 * never a CDN. Absolute, because the text library fetches it from a worker.
 */
export const FALLBACK_FONTS_PATH = '/graph-fonts/v1.0.1'

export const fallbackFontsUrl = () => new URL(FALLBACK_FONTS_PATH, window.location.origin).href
