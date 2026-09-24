import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { RigJoints } from './soldier'

/**
 * Soldiers modelled in Blender (scripts/blender/models.py), one mesh per
 * formation and level of detail, named `<group>_LOD0` (near) and `<group>_LOD1`
 * (far). Each carries the rig's per-vertex `gait`, `metal` and `weight`,
 * exported by glTF as `_GAIT`, `_METAL` and `_WEIGHT`, and the joints the rig
 * turns them about (every model shares one body, so one set of joints).
 */
export async function loadSoldierModels(url: string): Promise<{ models: Map<string, THREE.BufferGeometry>; rig: RigJoints }> {
  const gltf = await new GLTFLoader().loadAsync(url)
  const models = new Map<string, THREE.BufferGeometry>()
  let rig: RigJoints | undefined
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const g = mesh.geometry
    for (const name of ['gait', 'metal', 'weight']) {
      const attr = g.getAttribute(`_${name}`)
      if (!attr) throw new Error(`${mesh.name} has no ${name} attribute`)
      g.setAttribute(name, attr)
      g.deleteAttribute(`_${name}`)
    }
    rig ??= mesh.userData.rig as RigJoints | undefined
    models.set(mesh.name, g)
  })
  if (!rig) throw new Error('the soldier models carry no rig joints')
  return { models, rig }
}
