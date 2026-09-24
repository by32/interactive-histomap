// Stitches rendered film frames into the videos the page plays: H.264 MP4
// (plays everywhere) and VP9 WebM (smaller), a poster, WebVTT chapters and a
// film.json describing them. Needs ffmpeg on the PATH.
//   node scripts/thermopylae/stitch.mjs [frames dir] [out dir]
import { readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const [frames = '.cache/thermopylae/film/frames', out = '.cache/thermopylae/film/out'] = process.argv.slice(2)
const scene = JSON.parse(readFileSync('.cache/thermopylae/scene/scene.json', 'utf8'))
const { fps, chapters, fingerprint } = scene.film
const files = readdirSync(frames).filter((f) => /^\d{5}\.png$/.test(f)).sort()
if (!files.length) throw new Error(`no frames in ${frames}`)
const numbers = files.map((f) => Number(f.slice(0, 5)))
const first = numbers[0]
const missing = []
for (let n = first, i = 0; n <= numbers[numbers.length - 1]; n++) if (numbers[i] === n) i++; else missing.push(n)
if (missing.length) throw new Error(`missing frames: ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ` (+${missing.length - 20})` : ''}`)
mkdirSync(out, { recursive: true })
const input = ['-y', '-framerate', String(fps), '-start_number', String(first), '-i', join(frames, '%05d.png')]
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' })
ff([...input, '-c:v', 'libx264', '-crf', '20', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(out, 'thermopylae-film.mp4')])
ff([...input, '-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-row-mt', '1', '-pix_fmt', 'yuv420p', join(out, 'thermopylae-film.webm')])
// the poster: the last stand, if the range includes it
const posterFrame = Math.min(numbers[numbers.length - 1], Math.max(first, (chapters.find((c) => c.id === 'missiles')?.frame ?? first) + fps * 4))
ff(['-y', '-i', join(frames, `${String(posterFrame).padStart(5, '0')}.png`), '-q:v', '3', join(out, 'thermopylae-poster.jpg')])
const stamp = (s) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${(s % 60).toFixed(3).padStart(6, '0')}`
const start = first / fps
const end = (numbers[numbers.length - 1] + 1) / fps
const cues = chapters
  .map((c, i) => ({ ...c, from: Math.max(c.time, start), to: Math.min(chapters[i + 1]?.time ?? end, end) }))
  .filter((c) => c.to > c.from)
  .map((c) => `${stamp(c.from - start)} --> ${stamp(c.to - start)}\n${c.label}`)
writeFileSync(join(out, 'thermopylae-chapters.vtt'), `WEBVTT\n\n${cues.join('\n\n')}\n`)
const film = {
  fps,
  // the page plays this film only while the battle it shows is unchanged
  fingerprint,
  start,
  duration: end - start,
  frames: files.length,
  width: Number(process.env.FILM_WIDTH ?? 0) || undefined,
  height: Number(process.env.FILM_HEIGHT ?? 0) || undefined,
  sources: [
    { src: 'thermopylae-film.webm', type: 'video/webm; codecs="vp9"' },
    { src: 'thermopylae-film.mp4', type: 'video/mp4; codecs="avc1.640028"' },
  ],
  poster: 'thermopylae-poster.jpg',
  chapters: 'thermopylae-chapters.vtt',
  rendered: new Date().toISOString(),
}
writeFileSync(join(out, 'film.json'), JSON.stringify(film, null, 1) + '\n')
for (const f of readdirSync(out)) console.log(`  ${f} ${(statSync(join(out, f)).size / 1024 / 1024).toFixed(1)} MB`)
