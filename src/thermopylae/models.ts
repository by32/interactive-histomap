import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

/**
 * Soldiers modelled in Blender (scripts/blender/models.py), one mesh per
 * formation and level of detail, named `<group>_LOD0` (near) and `<group>_LOD1`
 * (far). Each carries the rig's `gait` and `metal` attributes, exported by
 * glTF as `_GAIT` / `_METAL`.
 */
export async function loadSoldierModels(url: string): Promise<Map<string, THREE.BufferGeometry>> {
  const gltf = await new GLTFLoader().loadAsync(url)
  const out = new Map<string, THREE.BufferGeometry>()
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const g = mesh.geometry
    for (const name of ['gait', 'metal']) {
      const attr = g.getAttribute(`_${name}`)
      if (!attr) throw new Error(`${mesh.name} has no ${name} attribute`)
      g.setAttribute(name, attr)
      g.deleteAttribute(`_${name}`)
    }
    out.set(mesh.name, g)
  })
  return out
}
