// Encodes the Cycles stills (scripts/blender/stills.py, 16-bit PNGs in
// .cache/thermopylae/stills) for the page: AVIF at full and half width with a
// WebP fallback, plus a manifest recording each step's fingerprint so the page
// never shows a still that no longer lines up. Fails if the stills outgrow
// their size budget, as build-data.mjs does for the map data.
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const SRC = '.cache/thermopylae/stills'
const SCENE = '.cache/thermopylae/scene/scene.json'
const OUT = 'public/thermopylae/stills'
const BUDGET = 8 * 1024 * 1024

const scene = JSON.parse(readFileSync(SCENE, 'utf8'))
mkdirSync(OUT, { recursive: true })
const manifest = { width: 0, height: 0, stages: {} }
let total = 0
for (const stage of scene.stages) {
  const png = join(SRC, `${stage.id}.png`)
  if (!existsSync(png)) continue
  const meta = await sharp(png).metadata()
  manifest.width = meta.width
  manifest.height = meta.height
  const entry = { fingerprint: stage.fingerprint, avif: {}, webp: {} }
  for (const w of [meta.width, Math.round(meta.width / 2)]) {
    const avif = `${stage.id}-${w}.avif`
    await sharp(png).resize({ width: w }).toColourspace('srgb').avif({ quality: w > 2000 ? 52 : 56, effort: 6, chromaSubsampling: '4:2:0' }).toFile(join(OUT, avif))
    entry.avif[w] = avif
    total += statSync(join(OUT, avif)).size
  }
  const w = Math.round(meta.width / 2)
  const webp = `${stage.id}-${w}.webp`
  await sharp(png).resize({ width: w }).toColourspace('srgb').webp({ quality: 78 }).toFile(join(OUT, webp))
  entry.webp[w] = webp
  total += statSync(join(OUT, webp)).size
  manifest.stages[stage.stage] = entry
  console.log(`  ${stage.id}`)
}
// drop encodings of steps that were renamed or removed
const keep = new Set(Object.values(manifest.stages).flatMap((e) => [...Object.values(e.avif), ...Object.values(e.webp)]))
for (const f of readdirSync(OUT)) if (/\.(avif|webp)$/.test(f) && !keep.has(f)) unlinkSync(join(OUT, f))
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n')
console.log(`stills: ${Object.keys(manifest.stages).length} steps, ${(total / 1024 / 1024).toFixed(1)} MB`)
if (total > BUDGET) {
  console.error(`stills exceed their ${BUDGET / 1024 / 1024} MB budget`)
  process.exit(1)
}
