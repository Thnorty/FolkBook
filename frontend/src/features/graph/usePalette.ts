import { useEffect, useMemo, useState } from 'react'
import { useAppearance } from '@/lib/appearance'
import type { Palette } from './graphModel'

const SPACES = ['sage', 'ochre', 'clay', 'plum', 'teal', 'slate'] as const

export type CanvasColors = {
  paper: string
  ink: string
  accent: string
  /** A face's rim, like a polaroid's frame, and initials on a space color. */
  frame: string
  onSpace: string
  palette: Palette
}

/**
 * The design tokens as plain colors, for the WebGL canvas (it can't read CSS). Tokens
 * are written as light-dark(), so each is read back through a probe element that the
 * browser resolves for the current theme. Read again when the theme changes.
 */
export function useCanvasColors(): CanvasColors {
  const { theme } = useAppearance()
  const systemDark = useSystemDark()

  return useMemo(() => {
    void [theme, systemDark] // the colors follow these, through the page's CSS
    const probe = document.createElement('span')
    probe.style.display = 'none'
    document.body.append(probe)
    const read = (token: string) => {
      probe.style.color = `var(${token})`
      return getComputedStyle(probe).color
    }
    const colors: CanvasColors = {
      paper: read('--paper'),
      ink: read('--ink'),
      accent: read('--accent'),
      frame: read('--photo-frame'),
      onSpace: read('--on-space'),
      palette: {
        me: read('--ink'),
        noSpace: read('--ink-faint'),
        edge: read('--ink'),
        spaceEdge: read('--ink-faint'),
        space: Object.fromEntries(
          SPACES.map((name) => [name, read(`--space-${name}`)]),
        ) as Palette['space'],
      },
    }
    probe.remove()
    return colors
  }, [theme, systemDark])
}

function useSystemDark() {
  const query = '(prefers-color-scheme: dark)'
  const [dark, setDark] = useState(() => window.matchMedia?.(query).matches ?? false)
  useEffect(() => {
    const media = window.matchMedia?.(query)
    if (!media?.addEventListener) return
    const change = () => setDark(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  return dark
}
