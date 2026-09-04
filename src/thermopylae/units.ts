import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { heightAt, stripZ, clampToStrip, ANOPAEA_XZ } from './terrain'
import { GROUPS, type GroupDef, type Placement } from './script'
import { interval } from './timeline'
import type { UnitKeyframe } from './film'

/* ---------- deterministic randomness ---------- */
const mulberry = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/* ---------- the Anopaea as an arc-length polyline ---------- */
const PATH_SAMPLES = 1500
export const anopaea = (() => {
  const pts = ANOPAEA_XZ.map(([x, z]) => new THREE.Vector3(x, heightAt(x, z) + 1.5, z))
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5)
  const spaced = curve.getSpacedPoints(PATH_SAMPLES)
  for (const p of spaced) p.y = heightAt(p.x, p.z) + 1.2
  return { curve, points: spaced }
})()

/** point and forward direction at fraction t of the path */
export function pathAt(t: number, out: THREE.Vector3, dir?: THREE.Vector3) {
  const f = Math.min(Math.max(t, 0), 1) * PATH_SAMPLES
  const i = Math.min(PATH_SAMPLES - 1, Math.floor(f))
  const a = anopaea.points[i]
  const b = anopaea.points[i + 1]
  out.lerpVectors(a, b, f - i)
  if (dir) dir.subVectors(b, a).setY(0).normalize()
}

/* ---------- figure geometry ---------- */
const FIGURE_SIZE = 1.6

function paint(geom: THREE.BufferGeometry, color: number, gait = 0): THREE.BufferGeometry {
  const c = new THREE.Color(color)
  const n = geom.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  geom.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  geom.setAttribute('gait', new THREE.BufferAttribute(new Float32Array(n).fill(gait), 1))
  return geom
}

/** a stylised soldier, ~2 m tall, facing local +z */
function figureGeometry(group: GroupDef): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const body = new THREE.CylinderGeometry(0.42, 0.5, 1.15, 6).translate(0, 1.05, 0)
  parts.push(paint(body, group.color))
  for (const side of [-1, 1]) {
    const leg = new THREE.CylinderGeometry(0.12, 0.1, 0.65, 5).translate(side * 0.22, 0.325, 0)
    parts.push(paint(leg, 0x806345, side))
  }
  const head = new THREE.SphereGeometry(0.3, 6, 5).translate(0, 1.85, 0)
  parts.push(paint(head, group.side === 'greek' ? 0xb98a5a : 0xc9a074))
  if (group.side === 'greek') {
    // helmet crest and hoplon
    const crest = new THREE.BoxGeometry(0.1, 0.32, 0.7).translate(0, 2.15, 0)
    parts.push(paint(crest, group.id === 'spartans' ? 0x8e2028 : 0x2a2622))
    const shield = new THREE.CylinderGeometry(0.62, 0.62, 0.08, 10)
      .rotateX(Math.PI / 2)
      .translate(-0.25, 1.05, 0.5)
    parts.push(paint(shield, 0xb08a3c))
    const spear = new THREE.CylinderGeometry(0.035, 0.035, 3.4, 4)
      .rotateX(-0.25)
      .translate(0.5, 1.9, 0.1)
    parts.push(paint(spear, 0x6b4c2a))
  } else {
    const cap = new THREE.CylinderGeometry(0.22, 0.3, 0.35, 6).translate(0, 2.15, 0)
    parts.push(paint(cap, group.id === 'immortals' ? 0xe0c24a : 0x5a4030))
    if (group.id === 'immortals' || group.id === 'medes') {
      const spara = new THREE.BoxGeometry(0.9, 1.5, 0.08).translate(-0.2, 1.0, 0.48)
      parts.push(paint(spara, 0xc7b27a))
    }
    const spear = new THREE.CylinderGeometry(0.03, 0.03, 2.4, 4).translate(0.45, 1.8, 0.1)
    parts.push(paint(spear, 0x6b4c2a))
  }
  const merged = mergeGeometries(parts, false)!
  for (const p of parts) p.dispose()
  // figures stand for several men each, so they are drawn larger than life
  merged.scale(FIGURE_SIZE, FIGURE_SIZE, FIGURE_SIZE)
  return merged
}

/* ---------- per-figure target layouts ---------- */
interface Layout {
  /** x, y, z, heading per figure */
  data: Float32Array
  visible: boolean
  /** path fractions per figure for marching columns */
  t?: Float32Array
  march?: number
  abreast?: number
  coastal?: Extract<Placement, { kind: 'coastal-column' }>
  onStrip?: boolean
}

const tmpV = new THREE.Vector3()
const tmpD = new THREE.Vector3()

function layoutFor(group: GroupDef, p: Placement, seed: number): Layout {
  const n = group.count
  const data = new Float32Array(n * 4)
  const rnd = mulberry(seed)
  const jitter = () => (rnd() - 0.5) * 0.9
  // strip placements resolve their centre from the strip fraction and keep every figure on the flat
  const spot = p.kind !== 'hidden' && p.kind !== 'column' && p.kind !== 'coastal-column' ? p : null
  const onStrip = spot !== null && spot.f !== undefined
  const cz = spot ? (spot.f !== undefined ? stripZ(spot.x, spot.f) : (spot.z ?? 0)) : 0
  const set = (i: number, x: number, z: number, heading: number) => {
    if (onStrip) z = clampToStrip(x, z)
    data[i * 4] = x
    data[i * 4 + 1] = heightAt(x, z)
    data[i * 4 + 2] = z
    data[i * 4 + 3] = heading
  }
  switch (p.kind) {
    case 'hidden':
      for (let i = 0; i < n; i++) set(i, 0, -5000, 0)
      return { data, visible: false }
    case 'block': {
      const s = p.spacing ?? 2.5
      const rows = Math.ceil(n / p.cols)
      const sinH = Math.sin(p.heading)
      const cosH = Math.cos(p.heading)
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / p.cols)
        const col = i % p.cols
        // local: lateral (x) across the front, depth (z) behind the front rank
        const lx = (col - (p.cols - 1) / 2) * s + jitter()
        const lz = -(row - (rows - 1) / 2) * s + jitter()
        const x = p.x + lx * cosH + lz * sinH
        const z = cz - lx * sinH + lz * cosH
        set(i, x, z, p.heading + (rnd() - 0.5) * 0.15)
      }
      return { data, visible: true, onStrip }
    }
    case 'scatter':
      for (let i = 0; i < n; i++) {
        let x = p.x
        let z = cz
        // rejection-sample into the ellipse and keep out of the sea
        for (let k = 0; k < 12; k++) {
          const a = rnd() * Math.PI * 2
          const r = Math.sqrt(rnd())
          x = p.x + Math.cos(a) * r * p.rx
          z = cz + Math.sin(a) * r * p.rz
          if (heightAt(x, z) > 0.4) break
        }
        set(i, x, z, rnd() * Math.PI * 2)
      }
      return { data, visible: true, onStrip }
    case 'ring':
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2
        const r = p.rMin + Math.sqrt(rnd()) * (p.rMax - p.rMin)
        const x = p.x + Math.cos(a) * r
        const z = cz + Math.sin(a) * r
        // face the centre (heading 0 = +z)
        set(i, x, z, Math.atan2(p.x - x, cz - z))
      }
      return { data, visible: true, onStrip }
    case 'coastal-column': {
      for (let i = 0; i < n; i++) {
        coastalAt(p, i, n, tmpV, tmpD)
        set(i, tmpV.x, tmpV.z, Math.atan2(tmpD.x, tmpD.z))
      }
      return { data, visible: true, coastal: p, onStrip: true }
    }
    case 'column': {
      const rows = Math.ceil(n / p.abreast)
      const t = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / p.abreast)
        // head of the column (row 0) is at t1, the tail at t0
        t[i] = p.t1 - (row / Math.max(1, rows - 1)) * (p.t1 - p.t0) + (rnd() - 0.5) * 0.0015
      }
      const layout: Layout = { data, visible: true, t, march: p.march ?? 0, abreast: p.abreast }
      placeColumn(layout, 0, rnd)
      return layout
    }
  }
}

function coastalAt(p: Extract<Placement, { kind: 'coastal-column' }>, i: number, count: number, out: THREE.Vector3, dir: THREE.Vector3) {
  const row = Math.floor(i / p.abreast)
  const rows = Math.ceil(count / p.abreast)
  const x = p.head + (p.tail - p.head) * row / Math.max(1, rows - 1)
  const lane = (i % p.abreast) - (p.abreast - 1) / 2
  const z = clampToStrip(x, stripZ(x, p.f) + lane * 2.4)
  out.set(x, heightAt(x, z), z)
  dir.set(2, 0, stripZ(x + 1, p.f) - stripZ(x - 1, p.f)).normalize()
}

function placeColumn(layout: Layout, offset: number, rnd?: () => number) {
  const { data, t, abreast } = layout
  if (!t || !abreast) return
  const n = t.length
  for (let i = 0; i < n; i++) {
    const f = Math.min(1, t[i] + offset)
    pathAt(f, tmpV, tmpD)
    const lane = (i % abreast) - (abreast - 1) / 2
    // perpendicular to the direction of travel
    const px = -tmpD.z
    const pz = tmpD.x
    const j = rnd ? (rnd() - 0.5) * 0.6 : 0
    const x = tmpV.x + px * (lane * 1.6 + j)
    const z = tmpV.z + pz * (lane * 1.6 + j)
    data[i * 4] = x
    data[i * 4 + 1] = heightAt(x, z)
    data[i * 4 + 2] = z
    data[i * 4 + 3] = Math.atan2(tmpD.x, tmpD.z)
  }
}

/* ---------- the armies ---------- */
const TRANSITION_S = 3.0
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

interface Army {
  def: GroupDef
  mesh: THREE.InstancedMesh
  from: Layout
  to: Layout
  seed: number
}

export class Armies {
  readonly root = new THREE.Group()
  /** torches carried by the Immortals: a line of lights on the mountain at night */
  readonly torches: THREE.Points
  private torchMat: THREE.PointsMaterial
  private armies: Army[] = []
  private progress = 1
  private stageTime = 0
  private material: THREE.MeshStandardMaterial
  private filmKeys: readonly UnitKeyframe[] = []
  private filmLayouts: Layout[][] = []
  private filmProgress: number | null = null
  private marchTime = { value: 0 }

  constructor() {
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 })
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.marchTime = this.marchTime
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
        attribute float gait;
        attribute vec2 motion;
        uniform float marchTime;`)
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float stride = sin(marchTime * 8.0 + motion.x);
        transformed.z += gait * stride * max(0.0, 1.04 - position.y) * 0.42 * motion.y;
        transformed.y += abs(stride) * 0.10 * motion.y * (gait == 0.0 ? 1.0 : 0.3);
        transformed.x += sin(marchTime * 4.0 + motion.x) * 0.025 * motion.y * max(position.y, 0.0);`)
    }
    const immortals = GROUPS.find((g) => g.id === 'immortals')!
    const tg = new THREE.BufferGeometry()
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(immortals.count * 3), 3))
    this.torchMat = new THREE.PointsMaterial({
      color: 0xffb060,
      size: 7,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
    this.torches = new THREE.Points(tg, this.torchMat)
    this.torches.frustumCulled = false
    this.torches.visible = false
    this.root.add(this.torches)
    GROUPS.forEach((def, gi) => {
      const geom = figureGeometry(def)
      const motion = new Float32Array(def.count * 2)
      for (let i = 0; i < def.count; i++) motion[i * 2] = i * 2.399963
      geom.setAttribute('motion', new THREE.InstancedBufferAttribute(motion, 2))
      const mesh = new THREE.InstancedMesh(geom, this.material, def.count)
      mesh.frustumCulled = false
      mesh.name = def.id
      const seed = 1000 + gi * 7919
      const hidden = layoutFor(def, { kind: 'hidden' }, seed)
      this.armies.push({ def, mesh, from: hidden, to: hidden, seed })
      this.root.add(mesh)
    })
    this.apply()
  }

  setStage(units: Record<string, Placement>, snap = false) {
    this.filmProgress = null
    for (const a of this.armies) {
      // start from where the figures currently stand
      a.from = this.snapshot(a)
      a.to = layoutFor(a.def, units[a.def.id] ?? { kind: 'hidden' }, a.seed)
    }
    this.progress = snap ? 1 : 0
    this.stageTime = 0
    if (snap) this.apply()
  }

  /** Cache authored arrangements once. Sampling is independent of playback history. */
  prepareFilm(keys: readonly UnitKeyframe[]) {
    this.filmKeys = keys
    this.filmLayouts = this.armies.map((a) => {
      const cache = new Map<string, Layout>()
      return keys.map((key) => {
        const placement = key.units[a.def.id] ?? { kind: 'hidden' as const }
        const id = JSON.stringify(placement)
        if (!cache.has(id)) cache.set(id, layoutFor(a.def, placement, a.seed))
        return cache.get(id)!
      })
    })
  }

  sampleFilm(time: number) {
    const { index, progress } = interval(this.filmKeys, time)
    this.filmProgress = progress
    this.marchTime.value = time
    this.armies.forEach((army, i) => {
      army.from = this.filmLayouts[i][index]
      army.to = this.filmLayouts[i][index + 1]
    })
    this.apply()
  }

  /** the current interpolated layout, so an interrupted move continues smoothly */
  private snapshot(a: Army): Layout {
    const k = ease(this.progress)
    const n = a.def.count
    const data = new Float32Array(n * 4)
    for (let i = 0; i < n * 4; i++) data[i] = a.from.data[i] + (a.to.data[i] - a.from.data[i]) * k
    return { data, visible: a.to.visible || (a.from.visible && k < 1) }
  }

  get settled(): boolean {
    return this.progress >= 1
  }

  /** 0 = torches out, 1 = full glow */
  setTorchGlow(v: number) {
    this.torchMat.opacity = v
    this.torches.visible = v > 0.01
  }

  update(dt: number) {
    const wasDone = this.progress >= 1
    this.progress = Math.min(1, this.progress + dt / TRANSITION_S)
    this.stageTime += dt
    this.marchTime.value = this.stageTime
    let marching = false
    for (const a of this.armies) {
      if (a.to.march && a.to.visible) {
        placeColumn(a.to, Math.min(0.12, a.to.march * this.stageTime))
        marching = true
      }
    }
    if (!wasDone || marching) this.apply()
  }

  private apply() {
    const k = this.filmProgress ?? ease(this.progress)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const pos = new THREE.Vector3()
    const scl = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)
    for (const a of this.armies) {
      const { from, to, mesh } = a
      const motion = mesh.geometry.getAttribute('motion') as THREE.InstancedBufferAttribute
      const n = a.def.count
      const fromS = from.visible ? 1 : 0
      const toS = to.visible ? 1 : 0
      const s = fromS + (toS - fromS) * k
      const coastal = from.coastal && to.coastal ? {
        ...to.coastal,
        head: from.coastal.head + (to.coastal.head - from.coastal.head) * k,
        tail: from.coastal.tail + (to.coastal.tail - from.coastal.tail) * k,
      } : null
      if (s <= 0.001 && !to.visible) {
        mesh.count = 0
        mesh.instanceMatrix.needsUpdate = true
        continue
      }
      mesh.count = n
      for (let i = 0; i < n; i++) {
        const o = i * 4
        // hidden layouts sit far away: don't drag figures across the map when appearing
        const fx = from.visible ? from.data[o] : to.data[o]
        const fy = from.visible ? from.data[o + 1] : to.data[o + 1]
        const fz = from.visible ? from.data[o + 2] : to.data[o + 2]
        const fh = from.visible ? from.data[o + 3] : to.data[o + 3]
        const tx = to.visible ? to.data[o] : fx
        const ty = to.visible ? to.data[o + 1] : fy
        const tz = to.visible ? to.data[o + 2] : fz
        const th = to.visible ? to.data[o + 3] : fh
        pos.set(fx + (tx - fx) * k, fy + (ty - fy) * k, fz + (tz - fz) * k)
        let heading = fh + Math.atan2(Math.sin(th - fh), Math.cos(th - fh)) * k
        if (this.filmProgress !== null) {
          if (from.t && to.t) {
            // Interpolate distance along the trail, never a chord through the mountain.
            pathAt(from.t[i] + (to.t[i] - from.t[i]) * k, pos, tmpD)
            const lane = (i % (to.abreast ?? 3)) - ((to.abreast ?? 3) - 1) / 2
            pos.x -= tmpD.z * lane * 1.6
            pos.z += tmpD.x * lane * 1.6
            pos.y = heightAt(pos.x, pos.z)
            heading = Math.atan2(tmpD.x, tmpD.z)
          } else if (coastal) {
            coastalAt(coastal, i, n, pos, tmpD)
            heading = Math.atan2(tmpD.x, tmpD.z)
          } else if (from !== to) {
            if (from.onStrip && to.onStrip) pos.z = clampToStrip(pos.x, pos.z)
            pos.y = heightAt(pos.x, pos.z)
          }
        }
        const moving = this.filmProgress !== null ? from !== to : (k < 1 || Boolean(to.march))
        motion.setY(i, moving && from.visible && to.visible ? 1 : 0)
        // shortest-way heading interpolation
        q.setFromAxisAngle(up, heading)
        scl.setScalar(s)
        m.compose(pos, q, scl)
        mesh.setMatrixAt(i, m)
        if (a.def.id === 'immortals') {
          const t = this.torches.geometry.attributes.position as THREE.BufferAttribute
          // every third figure carries a torch, held at shoulder height
          if (i % 3 === 0 && s > 0.5) t.setXYZ(i, pos.x, pos.y + 3.2, pos.z)
          else t.setXYZ(i, 0, -5000, 0)
          t.needsUpdate = true
        }
      }
      mesh.instanceMatrix.needsUpdate = true
      motion.needsUpdate = true
    }
  }
}
