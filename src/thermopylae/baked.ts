import * as THREE from 'three'
import { terrainFingerprint } from './fingerprint'

/** written by scripts/blender/bake.py */
interface BakeManifest {
  [tag: string]: { fingerprint: string; files: Record<string, string> }
}

const BASE = `${import.meta.env.BASE_URL}thermopylae/terrain/`
let manifest: Promise<BakeManifest | null> | null = null

/**
 * Drapes the Blender-baked terrain texture (colour with ambient occlusion) over
 * a terrain mesh, if one exists for the terrain as it is now. Resolves to
 * whether it was applied; the vertex colours stay otherwise.
 */
export async function applyBakedTerrain(mesh: THREE.Mesh, modern: boolean, renderer: THREE.WebGLRenderer): Promise<boolean> {
  manifest ??= fetch(`${BASE}manifest.json`)
    .then((r) => (r.ok ? (r.json() as Promise<BakeManifest>) : null))
    .catch(() => null)
  const entry = (await manifest)?.[modern ? 'today' : '480bc']
  if (!entry || entry.fingerprint !== terrainFingerprint(modern)) return false
  const sizes = Object.keys(entry.files).map(Number).sort((a, b) => b - a)
  // the full texture on capable screens, the half-size one on small or low-memory devices
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
  const small = Math.max(screen.width, screen.height) * devicePixelRatio < 1600 || memory < 4
  const fits = sizes.filter((s) => s <= renderer.capabilities.maxTextureSize)
  const size = (small ? fits[fits.length - 1] : fits[0]) ?? sizes[sizes.length - 1]
  const texture = await new THREE.TextureLoader().loadAsync(`${BASE}${entry.files[size]}`)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
  const material = mesh.material as THREE.MeshStandardMaterial
  material.map = texture
  material.vertexColors = false
  material.color.set(0xffffff)
  material.needsUpdate = true
  return true
}
