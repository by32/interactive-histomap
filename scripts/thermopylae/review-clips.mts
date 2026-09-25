// Records the live page's film, chapter by chapter, for a review before
// anything is re-rendered: steps the film's own clock frame by frame in
// headless Chromium (software WebGL), so clips are smooth however slow the
// machine, and encodes one MP4 per chapter plus a mid-chapter poster.
// The picture is the canvas alone, without the page's panels. Needs a running preview (`npm run build && npm run preview`) and ffmpeg
// (on the PATH, or $FFMPEG).
//   npm run review:clips -- [out dir] [--fps 6] [--width 960] [--height 540] [--chapters medes,dawn]
//   npm run review:clips -- [out dir] --at 24,66.5,100   (single frames at those film seconds)
import { chromium } from '@playwright/test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { FILM_CHAPTERS } from '../../src/thermopylae/film.ts'
import { FILM_DURATION } from '../../src/thermopylae/timeline.ts'

const argv = process.argv.slice(2)
const flag = (name: string, fallback: string) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback)
const out = argv[0] && !argv[0].startsWith('--') ? argv[0] : '.cache/thermopylae/review'
const fps = Number(flag('fps', '6'))
const width = Number(flag('width', '640')), height = Number(flag('height', '360'))
const only = flag('chapters', '').split(',').filter(Boolean)
const base = process.env.REVIEW_URL ?? 'http://localhost:4173/interactive-histomap/thermopylae.html'
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg'

mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] })
const page = await browser.newPage({ viewport: { width, height } })
// Screenshots wait on a compositor the busy page rarely frees (half a minute
// each in software WebGL): keep the drawing buffer and read the canvas instead
await page.addInitScript(() => {
  const getContext = HTMLCanvasElement.prototype.getContext as (this: HTMLCanvasElement, type: string, attributes?: object) => RenderingContext | null
  Object.assign(HTMLCanvasElement.prototype, {
    getContext(this: HTMLCanvasElement, type: string, attributes?: object) {
      return getContext.call(this, type, type.startsWith('webgl') ? { ...attributes, preserveDrawingBuffer: true } : attributes)
    },
  })
})
page.on('pageerror', (e) => console.error('page error:', e.message))
await page.goto(`${base}#film=0&c=0`)
await page.locator('body[data-soldiers="blender"]').waitFor({ timeout: 120_000 })
const seek = (t: number) => page.evaluate(async (time) => {
  const scrub = document.querySelector<HTMLInputElement>('#film-scrub')!
  scrub.step = 'any'
  scrub.value = String(time)
  scrub.dispatchEvent(new Event('input'))
  // the page's own frame callback, queued before this one, draws the new moment
  await new Promise((r) => requestAnimationFrame(r))
  return document.querySelector<HTMLCanvasElement>('#scene')!.toDataURL('image/png').split(',')[1]
}, t)

const at = flag('at', '').split(',').filter(Boolean).map(Number)
if (at.length) {
  for (const t of at) {
    const file = join(out, `frame-${t.toFixed(1).padStart(5, '0')}.png`)
    writeFileSync(file, Buffer.from(await seek(t), 'base64'))
    console.log(`  ${file}`)
  }
  await browser.close()
  process.exit(0)
}

const index: { id: string; label: string; time: number; clip: string; poster: string }[] = []
for (let c = 0; c < FILM_CHAPTERS.length; c++) {
  const chapter = FILM_CHAPTERS[c]
  if (only.length && !only.includes(chapter.id)) continue
  const end = FILM_CHAPTERS[c + 1]?.time ?? FILM_DURATION
  const frames = join(out, `frames-${chapter.id}`)
  rmSync(frames, { recursive: true, force: true })
  mkdirSync(frames, { recursive: true })
  const count = Math.round((end - chapter.time) * fps)
  const started = Date.now()
  for (let k = 0; k < count; k++) {
    const png = await seek(chapter.time + k / fps)
    writeFileSync(join(frames, `${String(k).padStart(4, '0')}.png`), Buffer.from(png, 'base64'))
  }
  const clip = `${String(c + 1).padStart(2, '0')}-${chapter.id}.mp4`
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(frames, '%04d.png'),
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-crf', '24', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(out, clip)])
  const poster = clip.replace('.mp4', '.jpg')
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', join(frames, `${String(Math.floor(count / 2)).padStart(4, '0')}.png`), '-q:v', '4', join(out, poster)])
  rmSync(frames, { recursive: true, force: true })
  index.push({ id: chapter.id, label: chapter.label, time: chapter.time, clip, poster })
  console.log(`  ${clip}: ${count} frames in ${((Date.now() - started) / 1000).toFixed(0)} s`)
}
writeFileSync(join(out, 'clips.json'), JSON.stringify(index, null, 1) + '\n')
await browser.close()
