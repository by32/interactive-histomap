import { EXTENT, heightAt, modernHeightAt } from './terrain'
import * as THREE from 'three'
import { CAMERA_FOV, GROUPS, STILL_SECONDS, type Stage } from './script'
import { formationHash, layoutHash } from './units'
import { FILM_CHAPTERS, LIGHT_KEYS, UNIT_KEYS } from './film'
import { FilmCamera } from './film-camera'
import { FILM_DURATION } from './timeline'

/** FNV-1a over a string, as 8 hex digits */
export function fnv(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/**
 * A short fingerprint of the terrain's shape. Assets baked from the terrain
 * (scripts/blender/bake.py) record it, and the page only uses them while it
 * still matches, so an edit to terrain.ts can never drape a stale texture over
 * a new heightfield. Heights are rounded to centimetres so the value is the
 * same in every browser's floating-point maths.
 */
export function terrainFingerprint(modern = false): string {
  const at = modern ? modernHeightAt : heightAt
  let h = 0x811c9dc5
  const N = 48
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const x = EXTENT.xMin + ((EXTENT.xMax - EXTENT.xMin) * i) / N
      const z = EXTENT.zMin + ((EXTENT.zMax - EXTENT.zMin) * j) / N
      let v = Math.round(at(x, z) * 100) | 0
      for (let k = 0; k < 4; k++) {
        h ^= v & 0xff
        h = Math.imul(h, 0x01000193)
        v >>>= 8
      }
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/**
 * What a step's rendered still depends on for lining up with the live view:
 * its camera, formations, the terrain, the field of view and the moment the
 * still is taken. A still is shown only while this matches.
 */
const stageFingerprints = new WeakMap<Stage, string>()
export function stageFingerprint(stage: Stage): string {
  const known = stageFingerprints.get(stage)
  if (known) return known
  const print = fnv(
    JSON.stringify({
      camera: stage.camera,
      units: stage.units,
      formations: formationHash(stage.units),
      fov: CAMERA_FOV,
      still: STILL_SECONDS,
      groups: GROUPS.map((g) => [g.id, g.count]),
      terrain: terrainFingerprint(false),
    }),
  )
  stageFingerprints.set(stage, print)
  return print
}

/**
 * What the rendered film depends on: its keys, where every formation in them
 * stands, the camera's path and the terrain. The page offers a rendered film
 * only while this matches, so a changed battle never plays an old render.
 * (A change to how the film moves between its keys alone does not show here:
 * re-render after one.)
 */
export function filmFingerprint(): string {
  const formations: number[] = []
  const seen = new Set<string>()
  for (const key of UNIT_KEYS) GROUPS.forEach((def, g) => {
    const placement = key.units[def.id] ?? { kind: 'hidden' as const }
    const id = `${g}:${JSON.stringify(placement)}`
    if (!seen.has(id)) { seen.add(id); formations.push(layoutHash(g, placement)) }
  })
  const camera = new FilmCamera(), eye = new THREE.Vector3(), target = new THREE.Vector3(), path: number[] = []
  for (let t = 0; t <= FILM_DURATION; t++) {
    camera.sample(t, eye, target)
    path.push(...[eye.x, eye.y, eye.z, target.x, target.y, target.z].map(Math.round))
  }
  return fnv(JSON.stringify({
    keys: UNIT_KEYS,
    light: LIGHT_KEYS,
    chapters: FILM_CHAPTERS.map((c) => [c.id, c.time]),
    formations,
    camera: path,
    groups: GROUPS.map((g) => [g.id, g.count]),
    terrain: terrainFingerprint(false),
  }))
}
