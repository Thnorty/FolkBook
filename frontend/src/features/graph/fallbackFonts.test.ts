import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FALLBACK_FONTS_PATH } from './fallbackFonts'

// The fallback fonts must be complete: any lookup the resolver can't answer from here, it
// sends to its CDN instead.
const root = join(__dirname, '..', '..', '..', 'public', FALLBACK_FONTS_PATH)
const read = (path: string) => JSON.parse(readFileSync(join(root, path), 'utf8')) as unknown

describe('the graph fallback fonts', () => {
  it('has an index file for every block of every Unicode plane', () => {
    for (let plane = 0; plane <= 16; plane++) {
      const files = readdirSync(join(root, 'codepoint-index', `plane${plane}`))
      expect(files, `plane ${plane}`).toHaveLength(256)
    }
  })

  it('has the metadata and the one font file for every font an index names', () => {
    const fonts = new Set<string>()
    for (let plane = 0; plane <= 16; plane++) {
      for (const file of readdirSync(join(root, 'codepoint-index', `plane${plane}`))) {
        const [, byLang] = read(`codepoint-index/plane${plane}/${file}`) as [
          number,
          Record<string, Record<string, string>>,
        ]
        for (const ids of Object.values(byLang)) for (const id of Object.keys(ids)) fonts.add(id)
      }
    }
    fonts.add('latin') // what the resolver uses when nothing covers a character

    for (const id of fonts) {
      const [, meta] = read(`font-meta/${id}.json`) as [
        number,
        { typeforms: Record<string, Record<string, number[]>> },
      ]
      const forms = Object.entries(meta.typeforms).flatMap(([category, styles]) =>
        Object.entries(styles).flatMap(([style, weights]) =>
          weights.map((weight) => `${category}.${style}.${weight}`),
        ),
      )
      expect(forms, id).toHaveLength(1) // so the resolver can't pick a file that isn't here
      expect(existsSync(join(root, 'font-files', id, `${forms[0]}.woff`)), id).toBe(true)
    }
  })
})
