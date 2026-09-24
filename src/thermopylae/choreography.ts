import * as THREE from 'three'
import { Armies } from './units'
import { FILM_CHAPTERS, UNIT_KEYS } from './film'
import { GROUPS } from './script'
import { FILM_DURATION } from './timeline'

/**
 * A quality audit of the film's troop movement, measured the way a viewer
 * sees it: every figure, sampled at the film's frame rate with the page's own
 * code. Jumps across a chapter change are the editor's cuts and are exempt;
 * everything within a shot must look like men walking, running and fighting.
 */
export const LIMITS = {
  /** m/s: no figure outruns a running man */
  speed: 5,
  /** m/s: men step back or sidle while fighting, but never walk backwards or sideways faster */
  offFacing: 1,
  /** rad/s: a man turns about in a second, not in a frame */
  turn: 4,
  /** m/s: figures keep their places in a formation as it moves */
  shuffle: .5,
} as const

/** Groups whose movement historically reverses within a chapter: the Spartans'
 * feigned retreats against the Immortals (Herodotus 7.211). */
export const FEINTS: readonly { chapter: string; group: string }[] = [{ chapter: 'immortals', group: 'spartans' }]

export interface AuditRow {
  chapter: string
  group: string
  /** fastest figure, m/s */
  speed: number
  /** fastest backward or sideways movement relative to the way a figure faces, m/s */
  offFacing: number
  /** fastest turn, rad/s */
  turn: number
  /** fastest movement of a figure relative to its formation, m/s */
  shuffle: number
  /** figures whose travel reverses in this chapter */
  reversals: number
  /** figures seen growing or shrinking out of the ground */
  growing: number
  /** figures standing in the sea */
  sea: number
  /** figures standing inside a figure of another group */
  overlaps: number
}

export interface Audit { rows: AuditRow[]; failures: string[] }

const chapterAt = (time: number) => FILM_CHAPTERS.findLastIndex((c) => time >= c.time)

interface Frame { x: Float32Array; z: Float32Array; y: Float32Array; fx: Float32Array; fz: Float32Array; s: Float32Array }

export function auditFilm(fps = 24): Audit {
  const armies = new Armies()
  armies.prepareFilm(UNIT_KEYS)
  const meshes = GROUPS.map((g) => armies.root.getObjectByName(g.id) as THREE.InstancedMesh)
  const read = (time: number): Frame[] => {
    armies.sampleFilm(time)
    return meshes.map((mesh) => {
      const n = mesh.geometry.getAttribute('motion').count, e = mesh.instanceMatrix.array
      const f: Frame = { x: new Float32Array(n), z: new Float32Array(n), y: new Float32Array(n), fx: new Float32Array(n), fz: new Float32Array(n), s: new Float32Array(n) }
      for (let i = 0; i < (mesh.count ? n : 0); i++) {
        const o = i * 16, s = Math.hypot(e[o + 8], e[o + 10])
        f.x[i] = e[o + 12]; f.y[i] = e[o + 13]; f.z[i] = e[o + 14]; f.s[i] = s
        if (s > 0) { f.fx[i] = e[o + 8] / s; f.fz[i] = e[o + 10] / s }
      }
      return f
    })
  }
  const rows = new Map<string, AuditRow>()
  const row = (chapter: number, group: number) => {
    const key = `${chapter}:${group}`
    if (!rows.has(key)) rows.set(key, { chapter: FILM_CHAPTERS[chapter].id, group: GROUPS[group].id, speed: 0, offFacing: 0, turn: 0, shuffle: 0, reversals: 0, growing: 0, sea: 0, overlaps: 0 })
    return rows.get(key)!
  }

  // frame by frame: speed, facing, turning, growing, the sea, other groups underfoot
  const frames = Math.round(FILM_DURATION * fps)
  let previous: Frame[] | null = null
  for (let k = 0; k <= frames; k++) {
    const time = k / fps, chapter = chapterAt(time)
    const now = read(time)
    const cut = previous === null || chapterAt((k - 1) / fps) !== chapter
    const grid = k % Math.round(fps / 2) === 0 ? new Map<number, number[]>() : null
    now.forEach((f, g) => {
      let growing = 0, sea = 0, visible = 0
      for (let i = 0; i < f.s.length; i++) {
        if (f.s[i] <= .001) continue
        visible++
        if (f.s[i] < .99) growing++
        if (f.y[i] < 0) sea++
        if (grid) {
          const cell = Math.floor(f.x[i]) * 65536 + Math.floor(f.z[i])
          const list = grid.get(cell) ?? []
          list.push(g, i)
          grid.set(cell, list)
        }
      }
      if (!visible) return
      const r = row(chapter, g)
      r.growing = Math.max(r.growing, growing)
      r.sea = Math.max(r.sea, sea)
      if (cut) return
      const p = previous![g], dt = 1 / fps
      for (let i = 0; i < f.s.length; i++) {
        if (f.s[i] < .99 || p.s[i] < .99) continue
        const vx = (f.x[i] - p.x[i]) / dt, vz = (f.z[i] - p.z[i]) / dt
        const forward = Math.max(0, vx * f.fx[i] + vz * f.fz[i])
        r.speed = Math.max(r.speed, Math.hypot(vx, vz))
        r.offFacing = Math.max(r.offFacing, Math.hypot(vx - forward * f.fx[i], vz - forward * f.fz[i]))
        const turn = Math.atan2(p.fx[i] * f.fz[i] - p.fz[i] * f.fx[i], p.fx[i] * f.fx[i] + p.fz[i] * f.fz[i])
        r.turn = Math.max(r.turn, Math.abs(turn) / dt)
      }
    })
    if (grid) {
      const hits = new Map<number, number>()
      for (const [cell, list] of grid) {
        for (let a = 0; a < list.length; a += 2) {
          const g = list[a], f = now[g], i = list[a + 1]
          let hit = false
          for (let dx = -1; dx <= 1 && !hit; dx++) for (let dz = -1; dz <= 1 && !hit; dz++) {
            const other = grid.get(cell + dx * 65536 + dz)
            if (!other) continue
            for (let b = 0; b < other.length && !hit; b += 2) {
              if (other[b] === g) continue
              const o = now[other[b]], j = other[b + 1]
              hit = Math.hypot(o.x[j] - f.x[i], o.z[j] - f.z[i]) < .7
            }
          }
          if (hit) hits.set(g, (hits.get(g) ?? 0) + 1)
        }
      }
      for (const [g, n] of hits) { const r = row(chapter, g); r.overlaps = Math.max(r.overlaps, n) }
    }
    previous = now
  }

  // key by key: formations hold together, and travel doesn't turn back
  const last = GROUPS.map((g) => new Float32Array(g.count * 2))
  let chapterSeen = -1
  for (let k = 0; k + 1 < UNIT_KEYS.length; k++) {
    const a = UNIT_KEYS[k], b = UNIT_KEYS[k + 1], span = b.time - a.time, chapter = chapterAt(a.time)
    if (span < .01) continue
    if (chapter !== chapterSeen) { last.forEach((l) => l.fill(0)); chapterSeen = chapter }
    const start = read(a.time), end = read(b.time)
    GROUPS.forEach((def, g) => {
      const from = a.units[def.id] ?? { kind: 'hidden' }, to = b.units[def.id] ?? { kind: 'hidden' }
      if (from.kind === 'hidden' || to.kind === 'hidden') return
      const s = start[g], e = end[g], n = def.count
      let mx = 0, mz = 0
      for (let i = 0; i < n; i++) { mx += e.x[i] - s.x[i]; mz += e.z[i] - s.z[i] }
      mx /= n; mz /= n
      const r = row(chapter, g)
      if (from.kind === to.kind && (to.kind === 'block' || to.kind === 'ring' || to.kind === 'scatter')) {
        for (let i = 0; i < n; i++) r.shuffle = Math.max(r.shuffle, Math.hypot(e.x[i] - s.x[i] - mx, e.z[i] - s.z[i] - mz) / span)
      }
      const feint = FEINTS.some((f) => f.chapter === FILM_CHAPTERS[chapter].id && f.group === def.id)
      let reversals = 0
      for (let i = 0; i < n; i++) {
        const dx = e.x[i] - s.x[i], dz = e.z[i] - s.z[i], d = Math.hypot(dx, dz)
        if (d < 1 || d / span < .25) continue
        const lx = last[g][i * 2], lz = last[g][i * 2 + 1]
        if (lx * dx + lz * dz < -.5 * d) reversals++
        last[g][i * 2] = dx / d; last[g][i * 2 + 1] = dz / d
      }
      if (!feint) r.reversals += reversals
    })
  }

  const ordered = [...rows.values()]
  const failures: string[] = []
  for (const r of ordered) {
    const name = `${r.chapter}: ${r.group}`
    if (r.speed > LIMITS.speed) failures.push(`${name} move at ${r.speed.toFixed(1)} m/s (limit ${LIMITS.speed})`)
    if (r.offFacing > LIMITS.offFacing) failures.push(`${name} move backwards or sideways at ${r.offFacing.toFixed(1)} m/s (limit ${LIMITS.offFacing})`)
    if (r.turn > LIMITS.turn) failures.push(`${name} turn at ${r.turn.toFixed(1)} rad/s (limit ${LIMITS.turn})`)
    if (r.shuffle > LIMITS.shuffle) failures.push(`${name} shuffle within their formation at ${r.shuffle.toFixed(1)} m/s (limit ${LIMITS.shuffle})`)
    if (r.reversals) failures.push(`${name}: ${r.reversals} figures turn back`)
    if (r.growing) failures.push(`${name}: ${r.growing} figures grow out of or sink into the ground`)
    if (r.sea) failures.push(`${name}: ${r.sea} figures stand in the sea`)
    if (r.overlaps) failures.push(`${name}: ${r.overlaps} figures stand inside another group`)
  }
  return { rows: ordered, failures }
}

export function formatAudit({ rows }: Audit) {
  const head = ['chapter', 'group', 'speed', 'off-facing', 'turn', 'shuffle', 'reversals', 'growing', 'sea', 'overlaps']
  const flag = (v: number, limit: number) => (v > limit ? '✗ ' : '  ') + v.toFixed(1)
  const lines = rows.map((r) => [r.chapter, r.group, flag(r.speed, LIMITS.speed), flag(r.offFacing, LIMITS.offFacing), flag(r.turn, LIMITS.turn), flag(r.shuffle, LIMITS.shuffle),
    ...[r.reversals, r.growing, r.sea, r.overlaps].map((v) => (v ? '✗ ' : '  ') + v)])
  const widths = head.map((h, c) => Math.max(h.length, ...lines.map((l) => l[c].length)))
  return [head, ...lines].map((l) => l.map((v, c) => v.padEnd(widths[c])).join('  ')).join('\n')
}
