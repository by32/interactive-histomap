import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  EXTENT,
  BEACH,
  heightAt,
  modernHeightAt,
  modernShore,
  slopeAt,
  shoreline,
  cliffFoot,
  fbm,
  smooth,
  SPERCHEIOS_XZ,
  OLD_ROAD_XZ,
  MOTORWAY_XZ,
  MONUMENT,
} from './terrain'
import { anopaea } from './units'
import type { Lighting } from './script'

const mulberry = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/* ---------- terrain ---------- */
const C = {
  seabed: new THREE.Color(0x7d8f74),
  seabedDeep: new THREE.Color(0x3d5a5c),
  sand: new THREE.Color(0xd9c89b),
  grass: new THREE.Color(0x8b9650),
  dry: new THREE.Color(0xb7a96a),
  scrub: new THREE.Color(0x6f7c47),
  rock: new THREE.Color(0x8f8375),
  rockPale: new THREE.Color(0xaaa294),
  rockDark: new THREE.Color(0x6e6357),
}

const FIELD_COLORS = [0x8fa257, 0xa9a862, 0x7d9346, 0xb5a56a, 0x9aa86b, 0x86995a].map((c) => new THREE.Color(c))
function hash2(ix: number, iy: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/**
 * The ground. `modern` swaps the ancient gulf for today's silted plain; the
 * mountain and the coastal strip are shared.
 */
export function buildTerrain(modern = false): THREE.Mesh {
  const hAtXZ = modern ? modernHeightAt : heightAt
  const nx = 760
  const nz = 460
  const w = EXTENT.xMax - EXTENT.xMin
  // z rows are spent unevenly: most of them across the coastal strip, where the
  // gates are a few metres wide, and the rest over the gulf and the mountain
  const zRow = (iz: number): number => {
    const u = iz / nz
    const seaEnd = 0.3
    const stripEnd = 0.7
    const z0 = -700
    const z1 = 80
    if (u < seaEnd) return EXTENT.zMin + (u / seaEnd) * (z0 - EXTENT.zMin)
    if (u < stripEnd) return z0 + ((u - seaEnd) / (stripEnd - seaEnd)) * (z1 - z0)
    return z1 + ((u - stripEnd) / (1 - stripEnd)) * (EXTENT.zMax - z1)
  }
  const positions = new Float32Array((nx + 1) * (nz + 1) * 3)
  const colors = new Float32Array((nx + 1) * (nz + 1) * 3)
  const col = new THREE.Color()
  const tmp = new THREE.Color()
  let p = 0
  for (let iz = 0; iz <= nz; iz++) {
    const z = zRow(iz)
    for (let ix = 0; ix <= nx; ix++) {
      const x = EXTENT.xMin + (ix / nx) * w
      positions[p] = x
      positions[p + 1] = hAtXZ(x, z)
      positions[p + 2] = z
      p += 3
    }
  }
  // colour by height and slope; slope comes from the grid itself
  const hAt = (ix: number, iz: number) => positions[(iz * (nx + 1) + ix) * 3 + 1]
  p = 0
  for (let iz = 0; iz <= nz; iz++) {
    const z = zRow(iz)
    const dz = (zRow(Math.min(nz, iz + 1)) - zRow(Math.max(0, iz - 1))) || 1
    for (let ix = 0; ix <= nx; ix++) {
      const x = EXTENT.xMin + (ix / nx) * w
      const y = positions[p + 1]
      const n = fbm(x * 0.004, z * 0.004, 3)
      const onPlain = modern && z < shoreline(x) + BEACH && z > modernShore(x) + BEACH
      if (onPlain) {
        // farmland: a patchwork of fields on the silt
        const f = hash2(Math.floor((x + 100000) / 170), Math.floor((z + 100000) / 130))
        col.copy(FIELD_COLORS[Math.floor(f * FIELD_COLORS.length)]).lerp(C.dry, 0.25 * n)
      } else if (y < 0) {
        col.copy(C.seabed).lerp(C.seabedDeep, smooth(0, -45, y))
      } else if (y < 2.2) {
        col.copy(C.sand).lerp(C.grass, smooth(0.8, 2.2, y))
      } else {
        const sx = (hAt(Math.min(nx, ix + 1), iz) - hAt(Math.max(0, ix - 1), iz)) / (2 * (w / nx))
        const sz = (hAt(ix, Math.min(nz, iz + 1)) - hAt(ix, Math.max(0, iz - 1))) / dz
        const slope = Math.hypot(sx, sz)
        col.copy(C.grass).lerp(C.dry, n)
        tmp.copy(C.scrub).lerp(C.rock, smooth(0.35, 0.9, slope))
        col.lerp(tmp, smooth(4, 60, y))
        tmp.copy(C.rock).lerp(C.rockPale, n).lerp(C.rockDark, smooth(0.9, 1.6, slope))
        col.lerp(tmp, smooth(0.45, 1.1, slope) * smooth(20, 120, y))
        col.lerp(C.rockPale, smooth(850, 1300, y) * 0.6)
      }
      // fine grain so the slopes read as ground rather than plastic
      const grain = 0.88 + 0.24 * fbm(x * 0.035, z * 0.035, 2)
      colors[p] = col.r * grain
      colors[p + 1] = col.g * grain
      colors[p + 2] = col.b * grain
      p += 3
    }
  }
  const index = new Uint32Array(nx * nz * 6)
  let k = 0
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const a = iz * (nx + 1) + ix
      const b = a + 1
      const c = a + nx + 1
      const dd = c + 1
      index[k++] = a
      index[k++] = c
      index[k++] = b
      index[k++] = b
      index[k++] = c
      index[k++] = dd
    }
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geom.setIndex(new THREE.BufferAttribute(index, 1))
  geom.computeVertexNormals()
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })
  const mesh = new THREE.Mesh(geom, mat)
  mesh.name = modern ? 'terrain-today' : 'terrain-480bc'
  return mesh
}

/* ---------- ribbons and dashes on the ground ---------- */
type Ground = (x: number, z: number) => number

/** a flat strip following a polyline, draped on the ground */
function ribbon(xz: [number, number][], width: number, color: number, ground: Ground, lift = 0.4): THREE.Mesh {
  const pts = xz.map(([x, z]) => new THREE.Vector3(x, 0, z))
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5)
  const n = Math.max(8, Math.round(curve.getLength() / 25))
  const spaced = curve.getSpacedPoints(n)
  const pos = new Float32Array((n + 1) * 2 * 3)
  const idx: number[] = []
  const dir = new THREE.Vector3()
  for (let i = 0; i <= n; i++) {
    const a = spaced[Math.max(0, i - 1)]
    const b = spaced[Math.min(n, i + 1)]
    dir.subVectors(b, a).normalize()
    const px = -dir.z * width * 0.5
    const pz = dir.x * width * 0.5
    const c = spaced[i]
    const y = Math.max(ground(c.x, c.z), 0) + lift
    pos.set([c.x + px, y, c.z + pz, c.x - px, y, c.z - pz], i * 6)
    if (i < n) {
      const o = i * 2
      idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3)
    }
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geom.setIndex(idx)
  geom.computeVertexNormals()
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 })
  return new THREE.Mesh(geom, mat)
}

/** a dashed line along z = f(x), draped on the ground: the ghost of a coastline */
function dashedAlongX(zOf: (x: number) => number, color: number, ground: Ground, lift: number): THREE.Mesh {
  const segs: THREE.BufferGeometry[] = []
  const dash = 70
  const gap = 45
  for (let x = EXTENT.xMin; x < EXTENT.xMax; x += dash + gap) {
    const x1 = Math.min(EXTENT.xMax, x + dash)
    const z0 = zOf(x)
    const z1 = zOf(x1)
    const cx = (x + x1) / 2
    const cz = (z0 + z1) / 2
    const len = Math.hypot(x1 - x, z1 - z0)
    const y = Math.max(ground(cx, cz), 0) + lift
    const g = new THREE.BoxGeometry(len, 1.2, 7)
      .rotateY(-Math.atan2(z1 - z0, x1 - x))
      .translate(cx, y, cz)
    segs.push(g)
  }
  const geom = mergeGeometries(segs, false)!
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.35,
    roughness: 0.6,
    polygonOffset: true,
    polygonOffsetFactor: -3,
  })
  return new THREE.Mesh(geom, mat)
}

/** what the 480 BC view shows of today: where the coast is now, drawn over the water */
export function buildModernCoastGhost(): THREE.Mesh {
  const m = dashedAlongX(modernShore, 0xf4e6c8, () => 0, 1.0)
  m.name = 'ghost-modern-coast'
  return m
}

/** what the present-day view carries: the plain's features and the ghost of the ancient shore */
export function buildModernFeatures(): THREE.Group {
  const g = new THREE.Group()
  g.name = 'today'
  const ground = modernHeightAt
  g.add(ribbon(SPERCHEIOS_XZ, 48, 0x3b7591, ground, 0.25))
  g.add(ribbon(OLD_ROAD_XZ, 9, 0x5c5f63, ground, 0.5))
  g.add(ribbon(MOTORWAY_XZ, 24, 0x4b4f55, ground, 0.6))
  // the Leonidas monument: a plinth, a stele and a figure, roughly to scale
  const stone = new THREE.MeshStandardMaterial({ color: 0xe6e0d2, roughness: 0.7 })
  const [mx, mz] = MONUMENT
  const my = ground(mx, mz)
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(22, 2, 9), stone)
  plinth.position.set(mx, my + 1, mz)
  const stele = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 3), stone)
  stele.position.set(mx, my + 4.5, mz + 2.5)
  const figure = new THREE.Mesh(new THREE.BoxGeometry(2.2, 6, 2.2), new THREE.MeshStandardMaterial({ color: 0x6b5a3e, roughness: 0.5, metalness: 0.4 }))
  figure.position.set(mx, my + 10, mz + 2.5)
  g.add(plinth, stele, figure)
  const ghost = dashedAlongX(shoreline, 0x6fb7d6, ground, 0.7)
  ghost.name = 'ghost-ancient-shore'
  g.add(ghost)
  return g
}

/* ---------- sea ---------- */
export function buildSea(): THREE.Mesh {
  const geom = new THREE.PlaneGeometry(60000, 60000).rotateX(-Math.PI / 2)
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2c6a8a,
    roughness: 0.55,
    metalness: 0.05,
    transparent: true,
    opacity: 0.86,
  })
  const mesh = new THREE.Mesh(geom, mat)
  mesh.position.y = 0
  mesh.name = 'sea'
  return mesh
}

/* ---------- sky ---------- */
export function buildSky(): {
  mesh: THREE.Mesh
  uniforms: { top: { value: THREE.Color }; bottom: { value: THREE.Color }; fog: { value: THREE.Color } }
} {
  const uniforms = {
    top: { value: new THREE.Color(0x4a7fc4) },
    bottom: { value: new THREE.Color(0xcfe0f0) },
    fog: { value: new THREE.Color(0xcdd9e4) },
  }
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 fog; varying vec3 vW;
      void main(){
        float h = normalize(vW).y;
        float t = pow(max(h + 0.05, 0.0), 0.55);
        vec3 c = mix(bottom, top, clamp(t, 0.0, 1.0));
        // dissolve into the fog at the horizon so sea and sky meet without a seam
        c = mix(fog, c, smoothstep(0.0, 0.14, h));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(26000, 24, 12), mat)
  mesh.name = 'sky'
  return { mesh, uniforms }
}

/* ---------- forest on the mountain ---------- */
export function buildForest(): THREE.InstancedMesh {
  const rnd = mulberry(4242)
  const canopy = new THREE.IcosahedronGeometry(4.2, 1).scale(1, 0.8, 1).translate(0, 6.2, 0)
  // the icosahedron is non-indexed; the trunk must match for the merge
  const trunk = new THREE.CylinderGeometry(0.6, 0.9, 4, 5).translate(0, 2, 0).toNonIndexed()
  const paintG = (g: THREE.BufferGeometry, c: number) => {
    const col = new THREE.Color(c)
    const n = g.attributes.position.count
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) arr.set([col.r, col.g, col.b], i * 3)
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
    return g
  }
  const geom = mergeGeometries([paintG(canopy, 0x4a6a32), paintG(trunk, 0x5a3f28)], false)!
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })
  const N = 4200
  const mesh = new THREE.InstancedMesh(geom, mat, N)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  const pos = new THREE.Vector3()
  let placed = 0
  let tries = 0
  while (placed < N && tries < N * 30) {
    tries++
    const x = EXTENT.xMin + rnd() * (EXTENT.xMax - EXTENT.xMin)
    const z = EXTENT.zMin + rnd() * (EXTENT.zMax - EXTENT.zMin)
    const y = heightAt(x, z)
    if (y < 110 || y > 1050) continue
    if (slopeAt(x, z, 12) > 0.95) continue
    // denser along the Anopaea (Herodotus' oak forest), thinner elsewhere
    const nearPath = Math.abs(z - 1350) < 260 ? 1 : 0.35
    if (rnd() > nearPath * (0.4 + 0.6 * fbm(x * 0.003, z * 0.003, 2))) continue
    const sc = 0.8 + rnd() * 0.7
    pos.set(x, y, z)
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI * 2)
    s.set(sc, sc * (0.9 + rnd() * 0.4), sc)
    m.compose(pos, q, s)
    mesh.setMatrixAt(placed++, m)
  }
  mesh.count = placed
  mesh.instanceMatrix.needsUpdate = true
  mesh.name = 'forest'
  return mesh
}

/* ---------- tents and fires ---------- */
export interface Camp {
  tents: THREE.InstancedMesh
  fires: THREE.Points
}

export function buildCamps(): Camp {
  const rnd = mulberry(99)
  const tent = new THREE.ConeGeometry(4.2, 4, 5).translate(0, 2, 0)
  const mat = new THREE.MeshStandardMaterial({ color: 0xd6c39c, roughness: 0.95 })
  const spots: [number, number, number, number, number][] = [
    // cx, cz, rx, rz, count
    [-2950, -450, 620, 520, 720],
    [-2450, -900, 230, 220, 90],
    [-3000, -1300, 260, 200, 90],
    [640, -150, 280, 70, 48],
  ]
  const total = spots.reduce((a, s) => a + s[4], 0)
  const mesh = new THREE.InstancedMesh(tent, mat, total)
  const firePos: number[] = []
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const one = new THREE.Vector3(1, 1, 1)
  const pos = new THREE.Vector3()
  let i = 0
  for (const [cx, cz, rx, rz, n] of spots) {
    for (let k = 0; k < n; k++) {
      let x = cx
      let z = cz
      for (let t = 0; t < 10; t++) {
        const a = rnd() * Math.PI * 2
        const r = Math.sqrt(rnd())
        x = cx + Math.cos(a) * r * rx
        z = cz + Math.sin(a) * r * rz
        if (heightAt(x, z) > 1) break
      }
      pos.set(x, heightAt(x, z), z)
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI * 2)
      m.compose(pos, q, one)
      mesh.setMatrixAt(i++, m)
      if (k % 3 === 0) firePos.push(x + 6, heightAt(x + 6, z) + 1.2, z)
    }
  }
  mesh.instanceMatrix.needsUpdate = true
  mesh.name = 'tents'
  const fg = new THREE.BufferGeometry()
  fg.setAttribute('position', new THREE.Float32BufferAttribute(firePos, 3))
  const fm = new THREE.PointsMaterial({
    color: 0xffa640,
    size: 9,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })
  const fires = new THREE.Points(fg, fm)
  fires.name = 'fires'
  return { tents: mesh, fires }
}

/* ---------- the Phocian wall ---------- */
export function buildWall(): THREE.Mesh {
  const x = 60
  const z0 = shoreline(x) + 4
  const z1 = cliffFoot(x) + 14
  const segs: THREE.BufferGeometry[] = []
  const step = 4
  for (let z = z0; z < z1; z += step) {
    const zc = z + step / 2
    // leave a gateway in the middle of the wall
    if (Math.abs(zc - (z0 + z1) / 2) < 3) continue
    const y = heightAt(x, zc)
    const g = new THREE.BoxGeometry(3, 3.2, step + 0.3).translate(x, y + 1.3, zc)
    segs.push(g)
  }
  const geom = mergeGeometries(segs, false)!
  const mat = new THREE.MeshStandardMaterial({ color: 0xb2a494, roughness: 1 })
  const mesh = new THREE.Mesh(geom, mat)
  mesh.name = 'wall'
  return mesh
}

/* ---------- the Anopaea path ---------- */
export function buildPath(): THREE.Mesh {
  const geom = new THREE.TubeGeometry(anopaea.curve, 400, 3.2, 5, false)
  // sit the tube on the ground
  const pos = geom.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    pos.setY(i, Math.max(pos.getY(i), heightAt(x, z) + 0.6))
  }
  pos.needsUpdate = true
  const mat = new THREE.MeshStandardMaterial({
    color: 0xd8b070,
    emissive: 0xb07830,
    emissiveIntensity: 0.25,
    roughness: 0.9,
    transparent: true,
    opacity: 0.85,
  })
  const mesh = new THREE.Mesh(geom, mat)
  mesh.name = 'anopaea'
  return mesh
}

/* ---------- the hot springs ---------- */
export function buildSprings(): THREE.Group {
  const g = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({
    color: 0x5fb8b0,
    emissive: 0x2a7a78,
    emissiveIntensity: 0.6,
    roughness: 0.2,
    transparent: true,
    opacity: 0.9,
  })
  for (const [x, z, r] of [
    [-215, -215, 9],
    [-195, -205, 6],
    [-232, -222, 5],
  ]) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 16).rotateX(-Math.PI / 2), mat)
    m.position.set(x, heightAt(x, z) + 0.15, z)
    g.add(m)
  }
  g.name = 'springs'
  return g
}

/* ---------- lighting presets ---------- */
export interface LightPreset {
  sunDir: THREE.Vector3
  sunColor: THREE.Color
  sunIntensity: number
  hemiSky: THREE.Color
  hemiGround: THREE.Color
  hemiIntensity: number
  skyTop: THREE.Color
  skyBottom: THREE.Color
  fog: THREE.Color
  fogNear: number
  fogFar: number
  fires: number
}

const preset = (
  sun: [number, number, number],
  sunColor: number,
  sunIntensity: number,
  hemiSky: number,
  hemiGround: number,
  hemiIntensity: number,
  skyTop: number,
  skyBottom: number,
  fog: number,
  fogNear: number,
  fogFar: number,
  fires: number,
): LightPreset => ({
  sunDir: new THREE.Vector3(...sun).normalize(),
  sunColor: new THREE.Color(sunColor),
  sunIntensity,
  hemiSky: new THREE.Color(hemiSky),
  hemiGround: new THREE.Color(hemiGround),
  hemiIntensity,
  skyTop: new THREE.Color(skyTop),
  skyBottom: new THREE.Color(skyBottom),
  fog: new THREE.Color(fog),
  fogNear,
  fogFar,
  fires,
})

// the sun sits to the south (+z); dawn in the east (+x), dusk in the west (−x)
export const LIGHTS: Record<Lighting, LightPreset> = {
  day: preset([0.25, 0.92, 0.3], 0xfff1dc, 2.6, 0xbcd6ee, 0x6b6046, 1.1, 0x3f78c2, 0xd4e3f2, 0xcdd9e4, 1800, 10500, 0),
  dawn: preset([0.9, 0.2, 0.3], 0xffb173, 1.9, 0xf3c9a4, 0x3d3830, 0.8, 0x3a5c93, 0xffbd8c, 0xe6b48f, 1500, 9000, 0.35),
  dusk: preset([-0.9, 0.14, 0.28], 0xff8d4d, 1.6, 0xe9a888, 0x36302a, 0.75, 0x2f3a68, 0xff9f6a, 0xd99a7c, 1400, 9000, 0.6),
  night: preset([-0.3, 0.7, 0.5], 0x8fa4d8, 0.9, 0x2a3860, 0x0e1018, 0.9, 0x070c1a, 0x1e2a4c, 0x161e34, 1000, 8000, 1),
}

export function lerpPreset(a: LightPreset, b: LightPreset, t: number, out: LightPreset) {
  out.sunDir.lerpVectors(a.sunDir, b.sunDir, t).normalize()
  out.sunColor.lerpColors(a.sunColor, b.sunColor, t)
  out.sunIntensity = a.sunIntensity + (b.sunIntensity - a.sunIntensity) * t
  out.hemiSky.lerpColors(a.hemiSky, b.hemiSky, t)
  out.hemiGround.lerpColors(a.hemiGround, b.hemiGround, t)
  out.hemiIntensity = a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * t
  out.skyTop.lerpColors(a.skyTop, b.skyTop, t)
  out.skyBottom.lerpColors(a.skyBottom, b.skyBottom, t)
  out.fog.lerpColors(a.fog, b.fog, t)
  out.fogNear = a.fogNear + (b.fogNear - a.fogNear) * t
  out.fogFar = a.fogFar + (b.fogFar - a.fogFar) * t
  out.fires = a.fires + (b.fires - a.fires) * t
}

export function clonePreset(p: LightPreset): LightPreset {
  return {
    sunDir: p.sunDir.clone(),
    sunColor: p.sunColor.clone(),
    sunIntensity: p.sunIntensity,
    hemiSky: p.hemiSky.clone(),
    hemiGround: p.hemiGround.clone(),
    hemiIntensity: p.hemiIntensity,
    skyTop: p.skyTop.clone(),
    skyBottom: p.skyBottom.clone(),
    fog: p.fog.clone(),
    fogNear: p.fogNear,
    fogFar: p.fogFar,
    fires: p.fires,
  }
}
