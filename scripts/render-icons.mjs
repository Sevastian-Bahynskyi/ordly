/**
 * Renders every installed-app icon from the one vector source, `branding/ordly-icon.svg`.
 *
 * Each PNG is rasterized at 4x its final size and downsampled with Lanczos, so curved edges are
 * properly anti-aliased at every size. The previous icons were rasterized without anti-aliasing,
 * which is what made the iPhone Home Screen icon look pixelated.
 *
 * The art is full-bleed: iOS and Android apply their own rounded mask, and the book stays inside
 * the maskable safe zone (the central 80% circle).
 *
 *   node scripts/render-icons.mjs
 *
 * After changing the art, bump ICON_VERSION in lib/app-icon.ts so installed clients refetch it.
 */
import { readFileSync } from 'node:fs'
import sharp from 'sharp'

const SOURCE = new URL('../branding/ordly-icon.svg', import.meta.url)
const OUTPUTS = [
  ['public/apple-touch-icon.png', 180],
  ['public/apple-touch-icon-precomposed.png', 180],
  ['public/icon-192.png', 192],
  ['public/icon-512.png', 512],
  ['public/icon-1024.png', 1024],
]
const SUPERSAMPLE = 4
const svg = readFileSync(SOURCE)

for (const [output, size] of OUTPUTS) {
  const raster = size * SUPERSAMPLE
  const large = await sharp(svg, { density: (72 * raster) / 1024 }).resize(raster, raster).png().toBuffer()
  await sharp(large)
    .resize(size, size, { kernel: 'lanczos3' })
    // iOS renders any transparency as black; the art is opaque, this only guarantees it.
    .flatten({ background: '#6a4cf0' })
    .png({ compressionLevel: 9 })
    .toFile(output)
  console.log(`${output} (${size}×${size})`)
}
