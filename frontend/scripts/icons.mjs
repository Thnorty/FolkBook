// Renders the app icons (public/icons/*.png) from the two SVG sources.
// Run after changing an icon SVG: npm run icons
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const file = (name) => fileURLToPath(new URL(`../public/icons/${name}`, import.meta.url))
const renders = [
  ['icon.svg', 'icon-192.png', 192],
  ['icon.svg', 'icon-512.png', 512],
  ['icon.svg', 'favicon-32.png', 32],
  ['icon-maskable.svg', 'icon-maskable-512.png', 512],
  // iOS rounds the corners itself, so it gets the full-bleed version.
  ['icon-maskable.svg', 'apple-touch-icon.png', 180],
]

for (const [source, target, size] of renders) {
  await sharp(file(source), { density: 300 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(file(target))
  console.log(`${target} (${size}px)`)
}
