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
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) meshes.set(m.name, m.geometry)
  })
  return meshes
}

test('every formation has a near and far model with the rig attributes', async () => {
  const meshes = await loadModels()
  for (const g of GROUPS) {
    for (const [lod, budget] of [['LOD0', 2000], ['LOD1', 480]] as const) {
      const geo = meshes.get(`${g.id}_${lod}`)
      expect(geo, `${g.id}_${lod}`).toBeTruthy()
      for (const name of ['position', 'normal', 'color', '_gait', '_metal'])
        expect(geo!.getAttribute(name), `${g.id}_${lod}.${name}`).toBeTruthy()
      const tris = (geo!.index?.count ?? geo!.getAttribute('position').count) / 3
      expect(tris, `${g.id}_${lod} triangles`).toBeLessThanOrEqual(budget)
      // feet on the ground, about a man's height before the page's exaggeration
      geo!.computeBoundingBox()
      const b = geo!.boundingBox!
      expect(b.min.y).toBeGreaterThan(-0.05)
      expect(b.min.y).toBeLessThan(0.05)
      const gait = new Set(Array.from(geo!.getAttribute('_gait').array as Float32Array))
      // legs and arms on both sides, plus the spear, are rigged
      for (const joint of [-2, -1, 1, 2, 3]) expect(gait.has(joint), `${g.id}_${lod} gait ${joint}`).toBe(true)
    }
  }
})

test('the armies adopt the models and the film still samples', async () => {
  const meshes = await loadModels()
  for (const [name, g] of meshes) {
    for (const a of ['gait', 'metal']) {
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
    for (const a of ['gait', 'metal', 'motion', 'battle']) expect(mesh.geometry.getAttribute(a), `${g.id}.${a}`).toBeTruthy()
    expect((mesh.geometry.getAttribute('motion') as THREE.InstancedBufferAttribute).count).toBe(g.count)
  }
})
