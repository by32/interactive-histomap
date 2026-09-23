import { EXTENT, heightAt, modernHeightAt } from './terrain'
import { CAMERA_FOV, GROUPS, STILL_SECONDS, type Stage } from './script'

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
export function stageFingerprint(stage: Stage): string {
  return fnv(
    JSON.stringify({
      camera: stage.camera,
      units: stage.units,
      fov: CAMERA_FOV,
      still: STILL_SECONDS,
      groups: GROUPS.map((g) => [g.id, g.count]),
      terrain: terrainFingerprint(false),
    }),
  )
}
