/**
 * A schematic heightfield of the pass of Thermopylae as it was in 480 BC.
 *
 * Not survey data: the shape follows the published descriptions (Herodotus
 * 7.176, 7.198–200, 7.216) and the geological reconstruction of the ancient
 * shoreline by Kraft, Rapp, Szemler, Tziavos & Kase (1987), in which the
 * Malian Gulf lapped within tens of metres of the cliffs of Kallidromo and
 * left a coastal track pinched into three "gates". Units are metres.
 *
 * Axes: x runs west (−) → east (+) along the pass; z runs north (−, the sea)
 * → south (+, the mountain); y is elevation.
 */

export const EXTENT = { xMin: -3600, xMax: 3000, zMin: -2600, zMax: 2000 }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const smooth = (a: number, b: number, t: number) => {
  const u = clamp((t - a) / (b - a), 0, 1)
  return u * u * (3 - 2 * u)
}
const gauss = (x: number, c: number, s: number) => Math.exp(-((x - c) * (x - c)) / (2 * s * s))

/* ---------- deterministic value noise ---------- */
function hash2(ix: number, iy: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}
function noise2(x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const u = fx * fx * (3 - 2 * fx)
  const v = fy * fy * (3 - 2 * fy)
  const a = hash2(ix, iy)
  const b = hash2(ix + 1, iy)
  const c = hash2(ix, iy + 1)
  const d = hash2(ix + 1, iy + 1)
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
}
/** fractal noise in [0, 1] */
export function fbm(x: number, y: number, octaves = 4): number {
  let sum = 0
  let amp = 1
  let freq = 1
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * freq + 17.1 * i, y * freq - 9.7 * i)
    norm += amp
    amp *= 0.5
    freq *= 2.07
  }
  return sum / norm
}

/* ---------- the pass ---------- */

/** z of the foot of the mountain: spurs at the three gates reach toward the sea */
export function cliffFoot(x: number): number {
  const spurs = 200 * gauss(x, -2000, 260) + 280 * gauss(x, 0, 190) + 220 * gauss(x, 1500, 230)
  return -spurs + 30 * (fbm(x * 0.0014, 7.3, 3) - 0.5)
}

/** width of the flat strip between cliff foot and shore, by control points */
const STRIP: [number, number][] = [
  [-3600, 2700],
  [-2800, 2500],
  [-2400, 700],
  [-2150, 120],
  [-2000, 48],
  [-1800, 160],
  [-1450, 380],
  [-1000, 520],
  [-500, 300],
  [-200, 110],
  [-60, 40],
  [0, 24],
  [90, 45],
  [300, 210],
  [700, 380],
  [1100, 260],
  [1350, 110],
  [1500, 50],
  [1650, 130],
  [1900, 500],
  [2300, 1100],
  [3000, 1700],
]
export function stripWidth(x: number): number {
  if (x <= STRIP[0][0]) return STRIP[0][1]
  for (let i = 1; i < STRIP.length; i++) {
    const [x1, w1] = STRIP[i]
    if (x <= x1) {
      const [x0, w0] = STRIP[i - 1]
      const t = (x - x0) / (x1 - x0)
      const u = 0.5 - 0.5 * Math.cos(Math.PI * t)
      return w0 + (w1 - w0) * u
    }
  }
  return STRIP[STRIP.length - 1][1]
}

/** z of the ancient shoreline */
export function shoreline(x: number): number {
  return cliffFoot(x) - stripWidth(x) + 24 * (fbm(x * 0.002, 3.1, 3) - 0.5)
}

/** z at fraction f across the coastal strip: 0 = cliff foot, 1 = the shore */
export function stripZ(x: number, f: number): number {
  const cf = cliffFoot(x)
  return cf + f * (shoreline(x) - cf)
}

/** pull a point onto the flat strip, `margin` metres in from the water and the slope */
export function clampToStrip(x: number, z: number, margin = 3): number {
  const lo = shoreline(x) + margin
  const hi = cliffFoot(x) - margin
  if (hi <= lo) return (lo + hi) / 2
  return Math.max(lo, Math.min(hi, z))
}

/** Kolonos, the low mound of the last stand, just east of the wall */
export const KOLONOS = { x: 350, z: -125, r: 62, h: 15 }

export function heightAt(x: number, z: number): number {
  const cf = cliffFoot(x)
  const sh = shoreline(x)
  const BEACH = 25
  if (z < sh - BEACH) {
    const d = sh - BEACH - z
    return Math.max(-70, -1.0 - d * 0.035 - 4 * fbm(x * 0.003, z * 0.003, 2))
  }
  if (z < cf) {
    // a gentle, continuous beach ramp keeps the waterline smooth on the mesh
    const s = z - sh
    if (s < BEACH) return -1.0 + 2.2 * smooth(-BEACH, BEACH, s)
    const t = (s - BEACH) / Math.max(1, cf - sh - BEACH)
    let h = 1.2 + 4.5 * t * t + 1.8 * fbm(x * 0.012, z * 0.012, 3) * smooth(BEACH, BEACH + 60, s)
    const dk = Math.hypot(x - KOLONOS.x, z - KOLONOS.z)
    h += KOLONOS.h * smooth(KOLONOS.r, 0, dk) ** 1.2
    // hot springs: a slight hollow by the middle gate
    h -= 1.2 * gauss(x, -210, 40) * gauss(z, -213, 25)
    return h
  }
  // the mountain wall of Kallidromo
  const d = z - cf
  let h =
    6 +
    250 * smooth(0, 230, d) +
    680 * smooth(160, 1450, d) +
    360 * smooth(900, 2050, d)
  h *= 0.82 + 0.36 * fbm(x * 0.00055 + 1.3, z * 0.00035, 3)
  const ridge = fbm(x * 0.0011, z * 0.0011, 5) - 0.5
  h += (40 + 0.2 * h) * ridge * smooth(0, 120, d)
  // gullies: valley lines where a second noise field crosses its midpoint
  const g2 = fbm(x * 0.0026 + 5.1, z * 0.0026, 3)
  h -= (20 + 0.07 * h) * (1 - Math.abs(2 * g2 - 1)) ** 2 * smooth(0, 220, d)
  h += 10 * (fbm(x * 0.007, z * 0.007, 2) - 0.5) * smooth(0, 60, d)
  // the Asopos gorge cuts the mountain south-west of the West Gate
  const gorge = gauss(x, -2480, 120) * smooth(0, 250, d)
  h *= 1 - 0.62 * gorge
  // the western massif (Oeta) recedes from the Spercheios plain
  h *= 1 - 0.35 * smooth(-2600, -3600, x)
  return h
}

export function slopeAt(x: number, z: number, e = 8): number {
  const dx = heightAt(x + e, z) - heightAt(x - e, z)
  const dz = heightAt(x, z + e) - heightAt(x, z - e)
  return Math.hypot(dx, dz) / (2 * e)
}

/* ---------- the Anopaea path over the mountain ---------- */
export const ANOPAEA_XZ: [number, number][] = [
  [-2560, -200],
  [-2470, 180],
  [-2340, 520],
  [-2050, 830],
  [-1700, 1080],
  [-1300, 1280],
  [-850, 1430],
  [-350, 1500],
  [180, 1470],
  [520, 1380],
  [900, 1210],
  [1300, 940],
  [1620, 560],
  [1780, 240],
  [1840, -80],
]
export const ANOPAEA_SUMMIT: [number, number] = [300, 1420]
