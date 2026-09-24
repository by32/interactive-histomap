import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { GROUPS } from '../src/thermopylae/script'
import { Armies } from '../src/thermopylae/units'
import { UNIT_KEYS } from '../src/thermopylae/film'

// The soldiers modelled in Blender (scripts/blender/models.py) must keep the
// contract of the page's vertex rig in src/thermopylae/soldier.ts.
async function loadModels() {
  const file = readFileSync('public/thermopylae/models/soldiers.glb')
  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)
  const gltf = await new GLTFLoader().parseAsync(buffer, '')
  const meshes = new Map<string, THREE.BufferGeometry>()
  const rigs: unknown[] = []
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    meshes.set(m.name, m.geometry)
    rigs.push(m.userData.rig)
  })
  return Object.assign(meshes, { rigs })
}

test('every formation has a near and far model with the rig attributes', async () => {
  const meshes = await loadModels()
  for (const g of GROUPS) {
    for (const [lod, budget] of [['LOD0', 2400], ['LOD1', 500]] as const) {
      const geo = meshes.get(`${g.id}_${lod}`)
      expect(geo, `${g.id}_${lod}`).toBeTruthy()
      for (const name of ['position', 'normal', 'color', '_gait', '_metal', '_weight'])
        expect(geo!.getAttribute(name), `${g.id}_${lod}.${name}`).toBeTruthy()
      const tris = (geo!.index?.count ?? geo!.getAttribute('position').count) / 3
      expect(tris, `${g.id}_${lod} triangles`).toBeLessThanOrEqual(budget)
      // feet on the ground, about a man's height before the page's exaggeration
      geo!.computeBoundingBox()
      const b = geo!.boundingBox!
      expect(b.min.y).toBeGreaterThan(-0.05)
      expect(b.min.y).toBeLessThan(0.05)
      const weight = Array.from(geo!.getAttribute('_weight').array as Float32Array)
      expect(Math.min(...weight)).toBeGreaterThanOrEqual(0)
      expect(Math.max(...weight)).toBeLessThanOrEqual(1)
      const gait = new Set(Array.from(geo!.getAttribute('_gait').array as Float32Array))
      // legs and arms on both sides, plus the spear, are rigged
      for (const joint of [-2, -1, 1, 2, 3]) expect(gait.has(joint), `${g.id}_${lod} gait ${joint}`).toBe(true)
    }
  }
})

/** The figure as a distant viewer sees it: the extent of the body and its
 * shield (not the spear or the hidden sword) and its mean colour by area. */
function appearance(geo: THREE.BufferGeometry) {
  const p = geo.getAttribute('position'), c = geo.getAttribute('color'), gait = geo.getAttribute('_gait'), index = geo.index!
  const box = new THREE.Box3(), colour = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3()
  let area = 0
  for (let t = 0; t < index.count; t += 3) {
    const tri = [index.getX(t), index.getX(t + 1), index.getX(t + 2)]
    if (tri.some((v) => Math.abs(gait.getX(v)) > 2.5)) continue
    a.fromBufferAttribute(p, tri[0]); b.fromBufferAttribute(p, tri[1]); d.fromBufferAttribute(p, tri[2])
    box.expandByPoint(a).expandByPoint(b).expandByPoint(d)
    const s = b.sub(a).cross(d.sub(a)).length() / 2
    area += s
    for (const v of tri) colour.add(new THREE.Vector3(c.getX(v), c.getY(v), c.getZ(v)).multiplyScalar(s / 3))
  }
  return { size: box.getSize(new THREE.Vector3()), colour: colour.divideScalar(area) }
}

test('near and far models look alike, so figures do not change as the camera passes', async () => {
  const meshes = await loadModels()
  for (const g of GROUPS) {
    const near = appearance(meshes.get(`${g.id}_LOD0`)!), far = appearance(meshes.get(`${g.id}_LOD1`)!)
    for (const axis of ['x', 'y', 'z'] as const)
      expect(Math.abs(far.size[axis] / near.size[axis] - 1), `${g.id} ${axis} extent`).toBeLessThan(.08)
    const sum = (v: THREE.Vector3) => v.x + v.y + v.z
    expect(Math.abs(sum(far.colour) / sum(near.colour) - 1), `${g.id} brightness`).toBeLessThan(.08)
    for (const channel of ['x', 'y', 'z'] as const)
      expect(Math.abs(far.colour[channel] / sum(far.colour) - near.colour[channel] / sum(near.colour)), `${g.id} hue`).toBeLessThan(.02)
  }
})

test('the models carry the joints the rig turns them about', async () => {
  const { rigs } = await loadModels()
  expect(rigs.length).toBe(GROUPS.length * 2)
  for (const rig of rigs as { hip: number[]; shoulder: number[]; hand: number[] }[]) {
    expect(rig.hip).toHaveLength(2)
    expect(rig.shoulder).toHaveLength(2)
    expect(rig.hand).toHaveLength(3)
    // a man's proportions: hips a little above half his height, shoulders near 0.8
    expect(rig.hip[0]).toBeGreaterThan(0.8)
    expect(rig.hip[0]).toBeLessThan(1.0)
    expect(rig.shoulder[0]).toBeGreaterThan(1.3)
    expect(rig.shoulder[0]).toBeLessThan(1.5)
    expect(rig.hand[1]).toBeGreaterThan(rig.hip[0])
  }
})

test('the armies adopt the models and the film still samples', async () => {
  const meshes = await loadModels()
  for (const [name, g] of meshes) {
    for (const a of ['gait', 'metal', 'weight']) {
      g.setAttribute(a, g.getAttribute(`_${a}`))
      g.deleteAttribute(`_${a}`)
    }
    meshes.set(name, g)
  }
  const armies = new Armies()
  armies.useModels(meshes)
  armies.prepareFilm(UNIT_KEYS)
  armies.sampleFilm(130)
  for (const g of GROUPS) {
    const mesh = armies.root.getObjectByName(g.id) as THREE.InstancedMesh
    for (const a of ['gait', 'metal', 'weight', 'motion', 'battle']) expect(mesh.geometry.getAttribute(a), `${g.id}.${a}`).toBeTruthy()
    expect((mesh.geometry.getAttribute('motion') as THREE.InstancedBufferAttribute).count).toBe(g.count)
  }
})
