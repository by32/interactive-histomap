/**
 * Writes the Thermopylae scene as data for Blender, from the very modules the
 * page runs: terrain, scenery builders, army layouts, the film clock, camera
 * and lighting. Blender never re-implements any of it.
 *
 *   node --experimental-strip-types --import ./scripts/thermopylae/ts-hook.mjs \
 *     scripts/thermopylae/export-scene.mts [--film a-b] [--fps 24] [--out dir]
 *
 * Coordinates stay in three.js space (x east, y up, z south; metres); the
 * Python side maps them to Blender's Z-up frame in one place.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as THREE from 'three'
import { EXTENT, heightAt, BEACH } from '../../src/thermopylae/terrain.ts'
import { GROUPS, STAGES, CAMERA_FOV, FIGURE_SCALE, STILL_SECONDS } from '../../src/thermopylae/script.ts'
import {
  buildTerrain,
  buildForest,
  buildCamps,
  buildWall,
  buildPath,
  buildSprings,
  buildModernFeatures,
  LIGHTS,
  lerpPreset,
  clonePreset,
  type LightPreset,
} from '../../src/thermopylae/scene.ts'
import { Armies } from '../../src/thermopylae/units.ts'
import { terrainFingerprint, stageFingerprint } from '../../src/thermopylae/fingerprint.ts'
import { UNIT_KEYS, LIGHT_KEYS, FILM_CHAPTERS } from '../../src/thermopylae/film.ts'
import { FilmCamera } from '../../src/thermopylae/film-camera.ts'
import { BattleEffects } from '../../src/thermopylae/battle.ts'
import { FILM_DURATION, interval, smoothstep } from '../../src/thermopylae/timeline.ts'

const args = process.argv.slice(2)
const arg = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const OUT = arg('out', '.cache/thermopylae/scene')!
const FPS = Number(arg('fps', '24'))
const STILL_T = STILL_SECONDS

mkdirSync(OUT, { recursive: true })
const write = (name: string, data: Float32Array | Uint32Array) => {
  writeFileSync(join(OUT, name), Buffer.from(data.buffer, data.byteOffset, data.byteLength))
  return name
}
const hex = (c: THREE.Color) => '#' + c.getHexString()
const lin = (c: THREE.Color) => [c.r, c.g, c.b].map((v) => +v.toFixed(6))

/* ---------- generic meshes: world-space triangles with a flat colour ---------- */
interface MeshEntry {
  name: string
  pos: string
  idx?: string
  col?: string
  color: number[]
  opacity: number
  emissive?: number[]
}
function meshEntries(root: THREE.Object3D, prefix: string): MeshEntry[] {
  root.updateMatrixWorld(true)
  const out: MeshEntry[] = []
  let n = 0
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || (mesh as unknown as THREE.InstancedMesh).isInstancedMesh) return
    const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
    const name = `${prefix}-${n++}`
    const mat = mesh.material as THREE.MeshStandardMaterial
    const entry: MeshEntry = {
      name,
      pos: write(`${name}.pos.f32`, g.attributes.position.array as Float32Array),
      color: lin(mat.color ?? new THREE.Color(1, 1, 1)),
      opacity: mat.transparent ? mat.opacity : 1,
    }
    if (g.index) entry.idx = write(`${name}.idx.u32`, Uint32Array.from(g.index.array))
    if (g.attributes.color) entry.col = write(`${name}.col.f32`, Float32Array.from(g.attributes.color.array))
    if (mat.emissive && mat.emissiveIntensity > 0 && mat.emissive.getHex() !== 0)
      entry.emissive = lin(mat.emissive.clone().multiplyScalar(mat.emissiveIntensity))
    out.push(entry)
  })
  return out
}

/* ---------- terrain: the live mesh, exactly ---------- */
function terrainEntry(modern: boolean) {
  const mesh = buildTerrain(modern)
  const g = mesh.geometry
  const pos = g.attributes.position.array as Float32Array
  // the grid is row-major in x; find the row length where z first changes
  let nx = 0
  while (pos[(nx + 1) * 3 + 2] === pos[2]) nx++
  const cols = nx + 1
  const rows = pos.length / 3 / cols
  const name = modern ? 'terrain-today' : 'terrain-480bc'
  return {
    name,
    cols,
    rows,
    pos: write(`${name}.pos.f32`, pos),
    col: write(`${name}.col.f32`, Float32Array.from(g.attributes.color.array)),
    uv: write(`${name}.uv.f32`, Float32Array.from(g.attributes.uv.array)),
    fingerprint: terrainFingerprint(modern),
    idx: write(`${name}.idx.u32`, Uint32Array.from(g.index!.array)),
  }
}

/* ---------- instanced scenery: matrices ---------- */
function instances(mesh: THREE.InstancedMesh, name: string) {
  return { name, count: mesh.count, mat: write(`${name}.mat.f32`, mesh.instanceMatrix.array.slice(0, mesh.count * 16) as Float32Array) }
}

/* ---------- armies ---------- */
/** per figure: x, y, z, heading, scale, battle.xyzw, motion.xy (11 floats), GROUPS order */
const ARMY_STRIDE = 11
const TOTAL_FIGURES = GROUPS.reduce((a, g) => a + g.count, 0)
function armyState(armies: Armies, out: Float32Array, offset = 0) {
  let o = offset
  const e = new THREE.Matrix4()
  for (const def of GROUPS) {
    const mesh = armies.root.getObjectByName(def.id) as THREE.InstancedMesh
    const battle = mesh.geometry.getAttribute('battle')
    const motion = mesh.geometry.getAttribute('motion')
    for (let i = 0; i < def.count; i++) {
      if (i < mesh.count) {
        e.fromArray(mesh.instanceMatrix.array, i * 16)
        const m = e.elements
        out[o] = m[12]
        out[o + 1] = m[13]
        out[o + 2] = m[14]
        out[o + 3] = Math.atan2(m[8], m[10])
        out[o + 4] = Math.hypot(m[0], m[1], m[2])
        out[o + 5] = battle.getX(i)
        out[o + 6] = battle.getY(i)
        out[o + 7] = battle.getZ(i)
        out[o + 8] = battle.getW(i)
        out[o + 9] = motion.getX(i)
        out[o + 10] = motion.getY(i)
      } else out.fill(0, o, o + ARMY_STRIDE)
      o += ARMY_STRIDE
    }
  }
  return o
}
function torchState(armies: Armies) {
  const p = armies.torches.geometry.getAttribute('position')
  const pts: number[] = []
  for (let i = 0; i < p.count; i++) if (p.getY(i) > -1000) pts.push(p.getX(i), p.getY(i), p.getZ(i))
  return new Float32Array(pts)
}

/* ---------- lighting as plain numbers ---------- */
const lightJson = (p: LightPreset) => ({
  sunDir: p.sunDir.toArray().map((v) => +v.toFixed(6)),
  sunColor: lin(p.sunColor),
  sunIntensity: p.sunIntensity,
  hemiSky: lin(p.hemiSky),
  hemiGround: lin(p.hemiGround),
  hemiIntensity: p.hemiIntensity,
  skyTop: lin(p.skyTop),
  skyBottom: lin(p.skyBottom),
  fog: lin(p.fog),
  fogNear: p.fogNear,
  fogFar: p.fogFar,
  fires: p.fires,
})

const resolve = ([x, z, up]: [number, number, number]) => [x, heightAt(x, z) + up, z]

/* ---------- camera probes: where known points land on screen, per three.js ---------- */
function probes(pos: number[], target: number[], aspect: number) {
  const cam = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 2, 50000)
  cam.position.fromArray(pos)
  cam.lookAt(new THREE.Vector3().fromArray(target))
  cam.updateMatrixWorld()
  const pts: { world: number[]; ndc: number[] }[] = []
  const t = new THREE.Vector3().fromArray(target)
  const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0)
  const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1)
  const d = cam.position.distanceTo(t)
  for (const [a, b] of [[0, 0], [0.25, 0.1], [-0.3, -0.15], [0.1, 0.25]]) {
    const w = t.clone().addScaledVector(right, a * d).addScaledVector(up, b * d)
    const n = w.clone().project(cam)
    pts.push({ world: w.toArray(), ndc: [n.x, n.y] })
  }
  return pts
}

/* ---------- run ---------- */
const scene: Record<string, unknown> = {
  version: 1,
  note: 'three.js coordinates: x east, y up, z south, metres. heading rotates about +y; 0 faces +z.',
  extent: EXTENT,
  beach: BEACH,
  camera: { fovV: CAMERA_FOV, near: 2, far: 50000 },
  figureScale: FIGURE_SCALE,
  stillSeconds: STILL_T,
  groups: GROUPS.map((g) => ({ id: g.id, side: g.side, count: g.count, color: lin(new THREE.Color(g.color)), hex: hex(new THREE.Color(g.color)) })),
  armyStride: ARMY_STRIDE,
  figures: TOTAL_FIGURES,
  lights: Object.fromEntries(Object.entries(LIGHTS).map(([k, v]) => [k, lightJson(v)])),
}

scene.terrain = { ancient: terrainEntry(false), modern: terrainEntry(true) }

// a coarse skirt of the same heightfield out to the horizon, for wide renders;
// under the modelled extent it drops far below the detailed mesh (a 200 m
// triangle across the cliff foot would otherwise poke through the concave ground)
function skirt() {
  const step = 200
  const [x0, x1, z0, z1] = [-18000, 16000, -16000, 16000]
  const cols = (x1 - x0) / step + 1
  const rows = (z1 - z0) / step + 1
  const pos = new Float32Array(cols * rows * 3)
  const inside = (x: number, z: number) => x > EXTENT.xMin + step && x < EXTENT.xMax - step && z > EXTENT.zMin + step && z < EXTENT.zMax - step
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x = x0 + i * step
      const z = z0 + j * step
      pos.set([x, inside(x, z) ? -500 : heightAt(x, z) - 0.3, z], (j * cols + i) * 3)
    }
  const idx = new Uint32Array((cols - 1) * (rows - 1) * 6)
  let k = 0
  for (let j = 0; j < rows - 1; j++)
    for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i
      idx.set([a, a + cols, a + 1, a + 1, a + cols, a + cols + 1], k)
      k += 6
    }
  return { cols, rows, pos: write('skirt.pos.f32', pos), idx: write('skirt.idx.u32', idx) }
}
scene.skirt = skirt()

const forest = buildForest()
const camps = buildCamps()
const fires = camps.fires.geometry.getAttribute('position').array as Float32Array
scene.scenery = {
  forest: instances(forest, 'forest'),
  tents: instances(camps.tents, 'tents'),
  fires: { count: fires.length / 3, pos: write('fires.pos.f32', Float32Array.from(fires)) },
  wall: meshEntries(buildWall(), 'wall'),
  path: meshEntries(buildPath(), 'path'),
  springs: meshEntries(buildSprings(), 'springs'),
  modern: meshEntries(buildModernFeatures(), 'modern'),
}

// stills: each stage's settled army, as the page shows it STILL_T seconds after arriving
const armies = new Armies()
scene.stages = STAGES.map((stage, i) => {
  armies.setStage(stage.units, true)
  armies.update(STILL_T)
  const state = new Float32Array(TOTAL_FIGURES * ARMY_STRIDE)
  armyState(armies, state)
  const id = `${String(i + 1).padStart(2, '0')}-${stage.id}`
  const pos = resolve(stage.camera.pos)
  const target = resolve(stage.camera.target)
  return {
    id,
    stage: stage.id,
    title: stage.title,
    fingerprint: stageFingerprint(stage),
    light: stage.light,
    path: Boolean(stage.path),
    camera: { pos, target },
    marchTime: STILL_T,
    armies: write(`stage-${id}.army.f32`, state),
    torches: write(`stage-${id}.torch.f32`, torchState(armies)),
    probes: probes(pos, target, 2560 / 1080),
  }
})

// the film: the page's own seekable clock, camera, lighting and battle effects
const frames = Math.round(FILM_DURATION * FPS)
scene.film = {
  fps: FPS,
  frames,
  duration: FILM_DURATION,
  chapters: FILM_CHAPTERS.map((c) => ({ id: c.id, time: c.time, frame: Math.round(c.time * FPS), label: c.label, title: c.title })),
}
const range = arg('film')
if (range) {
  const [a, b] = range.split('-').map(Number)
  const first = Math.max(0, a)
  const last = Math.min(frames - 1, b)
  const count = last - first + 1
  armies.prepareFilm(UNIT_KEYS)
  const effects = new BattleEffects()
  const cam = new FilmCamera()
  const eye = new THREE.Vector3()
  const target = new THREE.Vector3()
  const lightNow = clonePreset(LIGHTS.day)
  const army = new Float32Array(count * TOTAL_FIGURES * ARMY_STRIDE)
  const cams = new Float32Array(count * 6)
  const arrows = new Float32Array(count * 180 * 16)
  const arrowCounts = new Uint32Array(count)
  const perFrame: unknown[] = []
  const torchFrames: number[] = []
  const torchOffsets = new Uint32Array(count + 1)
  for (let f = first; f <= last; f++) {
    const k = f - first
    const t = f / FPS
    armies.sampleFilm(t)
    effects.sample(t, true)
    cam.sample(t, eye, target)
    cams.set([...eye.toArray(), ...target.toArray()], k * 6)
    armyState(armies, army, k * TOTAL_FIGURES * ARMY_STRIDE)
    arrowCounts[k] = effects.arrows.count
    arrows.set(effects.arrows.instanceMatrix.array.slice(0, effects.arrows.count * 16), k * 180 * 16)
    const light = interval(LIGHT_KEYS, t)
    lerpPreset(LIGHTS[light.from.light], LIGHTS[light.to.light], smoothstep(light.progress), lightNow)
    const glow = lightNow.fires * (0.94 + 0.06 * Math.sin(t * 11))
    const torches = torchState(armies)
    torchOffsets[k] = torchFrames.length / 3
    for (const v of torches) torchFrames.push(v)
    perFrame.push({
      frame: f,
      time: +t.toFixed(4),
      light: lightJson(lightNow),
      torchGlow: +glow.toFixed(4),
      from: light.from.light,
      to: light.to.light,
      blend: +smoothstep(light.progress).toFixed(5),
    })
  }
  torchOffsets[count] = torchFrames.length / 3
  const tag = `film-${first}-${last}`
  scene.filmRange = {
    first,
    last,
    camera: write(`${tag}.cam.f32`, cams),
    armies: write(`${tag}.army.f32`, army),
    arrows: write(`${tag}.arrow.f32`, arrows),
    arrowCounts: write(`${tag}.arrowcount.u32`, arrowCounts),
    torches: write(`${tag}.torch.f32`, new Float32Array(torchFrames)),
    torchOffsets: write(`${tag}.torchoff.u32`, torchOffsets),
    frames: perFrame,
  }
}

writeFileSync(join(OUT, 'scene.json'), JSON.stringify(scene, null, 1))
console.log(`scene written to ${OUT}: ${STAGES.length} stages, ${TOTAL_FIGURES} figures${range ? `, film frames ${range}` : ''}`)
