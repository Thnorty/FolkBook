// Builds public/graph-fonts/: the fallback fonts the graph's labels use for names outside
// the label font (Cyrillic, Greek, Arabic, CJK, emoji…), so the browser gets them from
// FolkBook instead of a CDN.
//
// The graph's text library (troika-three-text) finds fonts for such characters with
// unicode-font-resolver, whose data normally comes from cdn.jsdelivr.net. This copies that
// data from a pinned commit, keeping one typeform per font (sans-serif if there is one,
// normal, the weight nearest the labels' 500) and trimming each font's metadata to match,
// so the resolver can only ask for files that are here. Every index file is kept: a
// missing one would make the resolver fall back to the CDN.
//
// Run: npm run graph-fonts (needs internet; the output is committed).

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = 'lojjic/unicode-font-resolver'
const TAG = 'v1.0.1' // the data version troika's resolver client expects
const COMMIT = '4faa2778f9a5cefa04cc2295849fbd1f6fb50919' // TAG, pinned
const WEIGHT = 500
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'graph-fonts', TAG)

const raw = (path) => `https://raw.githubusercontent.com/${REPO}/${COMMIT}/packages/data/${path}`

async function get(url, attempts = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`${response.status} ${url}`)
      return Buffer.from(await response.arrayBuffer())
    } catch (error) {
      if (attempt === attempts) throw error
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt))
    }
  }
}

async function save(path, data) {
  await mkdir(dirname(join(OUT, path)), { recursive: true })
  await writeFile(join(OUT, path), data)
}

/** Runs `task` over `items`, a few at a time. */
async function each(items, task, at = 16) {
  let next = 0
  const worker = async () => {
    while (next < items.length) await task(items[next++])
  }
  await Promise.all(Array.from({ length: at }, worker))
}

/** The one typeform kept: sans-serif if there is one, normal, the weight nearest WEIGHT. */
function pick(typeforms) {
  const category = 'sans-serif' in typeforms ? 'sans-serif' : Object.keys(typeforms)[0]
  const styles = typeforms[category]
  const style = 'normal' in styles ? 'normal' : Object.keys(styles)[0]
  const weight = styles[style].reduce((best, w) =>
    Math.abs(w - WEIGHT) < Math.abs(best - WEIGHT) ? w : best,
  )
  return { category, style, weight }
}

const tree = JSON.parse(
  await get(`https://api.github.com/repos/${REPO}/git/trees/${COMMIT}?recursive=1`),
).tree
const paths = (prefix) =>
  tree
    .filter((item) => item.type === 'blob' && item.path.startsWith(`packages/data/${prefix}`))
    .map((item) => item.path.slice('packages/data/'.length))

await rm(OUT, { recursive: true, force: true })
const indexes = paths('codepoint-index/')
const metas = paths('font-meta/')
console.log(`${indexes.length} index files, ${metas.length} fonts`)

await each(indexes, async (path) => save(path, await get(raw(path))))
await each(metas, async (path) => {
  const [version, meta] = JSON.parse(await get(raw(path)))
  const { category, style, weight } = pick(meta.typeforms)
  const trimmed = { ...meta, typeforms: { [category]: { [style]: [weight] } } }
  await save(path, JSON.stringify([version, trimmed]))
  const file = `font-files/${meta.id}/${category}.${style}.${weight}.woff`
  await save(file, await get(raw(file)))
})
await save('schema-version.json', await get(raw('schema-version.json')))
await save('LICENSE', await get(raw('LICENSE')))
// The OFL's text, as shipped with the label font, under the Noto fonts' copyright.
const ofl = await readFile(
  join(OUT, '..', '..', '..', 'src', 'features', 'graph', 'fonts', 'OFL.txt'),
  'utf8',
)
await save(
  'OFL.txt',
  `Copyright 2012-2024 The Noto Project Authors (https://github.com/notofonts)

` + ofl.slice(ofl.indexOf('This Font Software is licensed')),
)
await save(
  'README.md',
  `# Graph fallback fonts

Fonts for graph labels in scripts the label font doesn't cover, served by FolkBook so the
browser never asks a CDN. Built by \`npm run graph-fonts\` (\`scripts/graph-fonts.mjs\`) from
[unicode-font-resolver](https://github.com/${REPO}) ${TAG} (\`${COMMIT}\`), one typeform
per font. Don't edit by hand.

- The data and index: MIT, see \`LICENSE\`.
- The fonts: [Noto](https://github.com/notofonts), SIL Open Font License 1.1, see \`OFL.txt\`.
`,
)
console.log(`Done: ${OUT}`)
