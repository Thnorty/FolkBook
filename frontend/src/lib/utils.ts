import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Our theme names (src/index.css), so tailwind-merge knows `text-md` is a size and
// `text-ink` a color, and doesn't drop one of them as a duplicate.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['2xs', 'md', 'input', 'hand'],
      shadow: ['paper', 'note', 'photo', 'float', 'marker', 'ribbon'],
      radius: ['tab', 'card', 'sheet'],
    },
  },
})

/** Join class names; later Tailwind classes win over earlier conflicting ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
