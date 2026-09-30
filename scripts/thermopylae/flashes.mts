// Scans an encoded review clip for frames that flash: used by review-clips.mts.
//   node --experimental-strip-types scripts/thermopylae/flashes.mts clip.mp4 [...]
import { execFileSync } from 'node:child_process'

/**
 * Frames a viewer would see flash: the sea suddenly covering more of the
 * picture than in the frames either side (it once jumped over the land), or a
 * patch of the picture much brighter than either neighbour (a flare).
 */
export function flashes(clip: string, ffmpeg = process.env.FFMPEG ?? 'ffmpeg') {
  const W = 160, H = 90, size = W * H * 3
  const raw = execFileSync(ffmpeg, ['-loglevel', 'error', '-i', clip, '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 30 })
  const frames = raw.length / size, sea: number[] = [], found: string[] = []
  const at = (k: number, i: number) => raw[k * size + i]
  for (let k = 0; k < frames; k++) {
    let n = 0
    for (let i = 0; i < W * H; i++) { const r = at(k, i * 3), g = at(k, i * 3 + 1), b = at(k, i * 3 + 2); if (g - r > 25 && b - r > 15) n++ }
    sea.push(n / (W * H))
  }
  for (let k = 1; k + 1 < frames; k++) {
    const jump = sea[k] - Math.max(sea[k - 1], sea[k + 1])
    if (jump > .02) found.push(`sea +${(jump * 100).toFixed(0)}% at frame ${k}`)
    let bright = 0
    for (let i = 0; i < W * H; i++) {
      const lum = (k2: number) => at(k2, i * 3) + at(k2, i * 3 + 1) + at(k2, i * 3 + 2)
      // near white, and well above the same pixel in both neighbouring frames
      if (lum(k) > 640 && lum(k) - Math.max(lum(k - 1), lum(k + 1)) > 120) bright++
    }
    if (bright >= 4) found.push(`flare of ${bright} px at frame ${k}`)
  }
  return found
}

if (import.meta.url === `file://${process.argv[1]}`)
  for (const clip of process.argv.slice(2)) console.log(clip.split('/').pop(), flashes(clip).join(', ') || 'no flashes')
