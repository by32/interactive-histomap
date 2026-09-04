import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { GroupDef } from './script'

// Forms follow late-Archaic Greek equipment and Herodotus 7.61 for Persian
// dress. Colours identify formations; they are not documented uniforms.
export const FIGURE_SIZE = 1.6
const BRONZE = 0xb59057
const DARK_BRONZE = 0x78613e
const SKIN = 0xb38463
const LEATHER = 0x4b3426

function part(g: THREE.BufferGeometry, colour: number, gait = 0, metal = 0) {
  const c = new THREE.Color(colour)
  const n = g.attributes.position.count
  const colours = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) colours.set([c.r, c.g, c.b], i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3))
  g.setAttribute('gait', new THREE.BufferAttribute(new Float32Array(n).fill(gait), 1))
  g.setAttribute('metal', new THREE.BufferAttribute(new Float32Array(n).fill(metal), 1))
  return g.index ? g.toNonIndexed() : g
}

/** Metres before the atlas exaggeration. Local +z is the soldier's front. */
export function soldierGeometry(group: GroupDef, detailed = false) {
  const pieces: THREE.BufferGeometry[] = []
  const greek = group.side === 'greek'
  const segments = detailed ? 10 : 5
  const add = (g: THREE.BufferGeometry, c: number, gait = 0, metal = 0) => pieces.push(part(g, c, gait, metal))
  const cylinder = (r1: number, r2: number, h: number, x: number, y: number, z: number) =>
    new THREE.CylinderGeometry(r1, r2, h, segments).translate(x, y, z)

  // Separate articulated legs and shoes. The vertex rig rotates about the hips.
  for (const side of [-1, 1]) {
    add(cylinder(0.09, 0.075, 0.70, side * 0.12, 0.42, 0), greek ? SKIN : group.color, side)
    add(new THREE.BoxGeometry(0.17, 0.09, 0.29).translate(side * 0.12, 0.07, 0.065), LEATHER, side)
    if (greek && detailed) add(cylinder(0.095, 0.075, 0.39, side * 0.12, 0.34, 0.015), BRONZE, side, 0.72)
  }
  add(cylinder(0.23, 0.30, 0.40, 0, 0.87, 0), group.color)
  add(cylinder(0.245, 0.215, 0.48, 0, 1.25, 0), greek ? 0xd6c9ac : group.color)
  add(new THREE.SphereGeometry(0.148, segments, detailed ? 8 : 4).scale(0.9, 1.15, 0.95).translate(0, 1.72, 0), SKIN)
  add(cylinder(0.085, 0.08, 0.13, 0, 1.53, 0), SKIN)

  // Arms and equipment share the arm rig, with a restrained walking counter-swing.
  for (const side of [-1, 1]) {
    add(cylinder(0.086, 0.065, 0.38, side * 0.30, 1.22, 0.025), greek ? SKIN : group.color, side * 2)
    add(new THREE.SphereGeometry(0.069, segments, 4).translate(side * 0.31, 1.00, 0.07), SKIN, side * 2)
  }

  if (greek) {
    // Corinthian dome, neck protection, cheek plates and narrow nose guard.
    add(new THREE.SphereGeometry(0.174, segments, detailed ? 8 : 4, 0, Math.PI * 2, 0, Math.PI * 0.55)
      .scale(0.98, 1.13, 1.07).translate(0, 1.76, 0), BRONZE, 0, 0.78)
    add(new THREE.CylinderGeometry(0.17, 0.195, 0.16, segments, 1, true, Math.PI * 0.45, Math.PI * 1.1)
      .translate(0, 1.69, -0.005), BRONZE, 0, 0.78)
    for (const side of [-1, 1]) {
      add(new THREE.BoxGeometry(0.10, 0.16, 0.045).rotateZ(side * -0.13)
        .translate(side * 0.114, 1.66, 0.11), BRONZE, 0, 0.78)
    }
    add(new THREE.BoxGeometry(0.028, 0.15, 0.035).translate(0, 1.72, 0.167), BRONZE, 0, 0.78)
    if (detailed) {
      // A low longitudinal horsehair crest, rather than a tall fantasy headdress.
      add(new THREE.TorusGeometry(0.20, 0.043, 4, 12, Math.PI).rotateY(Math.PI / 2)
        .translate(0, 1.89, 0), 0x342b25)
      for (const side of [-1, 1]) {
        add(new THREE.BoxGeometry(0.115, 0.065, 0.37).translate(side * 0.14, 1.49, 0), 0xe1d5b8)
      }
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * Math.PI * 2
        add(new THREE.BoxGeometry(0.105, 0.19, 0.025).rotateY(a)
          .translate(Math.sin(a) * 0.27, 0.98, Math.cos(a) * 0.27), 0xc3b696)
      }
    }
    // Convex, wood-cored round aspis with a bronze rim. No universal lambda.
    add(new THREE.SphereGeometry(0.46, detailed ? 20 : 10, detailed ? 10 : 5)
      .scale(1, 1, 0.19).translate(-0.34, 1.14, 0.31), DARK_BRONZE, -2, 0.5)
    if (detailed) {
      add(new THREE.TorusGeometry(0.447, 0.024, 4, 24).translate(-0.34, 1.14, 0.32), BRONZE, -2, 0.8)
      add(new THREE.CircleGeometry(0.32, 24).translate(-0.34, 1.14, 0.403), 0x6d3928, -2)
    }
    const spear = cylinder(0.018, 0.022, 2.42, 0, 0, 0).rotateX(-0.15).translate(0.36, 1.55, 0.08)
    add(spear, 0x6b4d2e, 2)
    add(new THREE.ConeGeometry(0.047, 0.22, 4).rotateX(-0.15).translate(0.36, 2.85, -0.11), 0x93958d, 2, 0.8)
    if (detailed) add(new THREE.BoxGeometry(0.05, 0.52, 0.07).rotateZ(-0.25).translate(0.22, 0.88, -0.10), LEATHER)
  } else {
    // Soft tiara with an ear/neck flap, long sleeves, trousers and bow case.
    add(new THREE.SphereGeometry(0.17, segments, 5).scale(1, 1.5, 1.05)
      .rotateZ(-0.24).translate(0.025, 1.88, -0.015), 0x9c8964)
    add(new THREE.BoxGeometry(0.33, 0.17, 0.04).translate(0, 1.65, -0.10), 0x9c8964)
    add(cylinder(0.08, 0.07, 0.58, 0.22, 1.27, -0.21), LEATHER)
    const wicker = new THREE.BoxGeometry(0.46, 0.92, 0.055).translate(-0.30, 0.93, 0.32)
    add(wicker, 0xa78a50, -2)
    add(cylinder(0.017, 0.021, 1.80, 0.35, 1.37, 0.055), 0x785534, 2)
    add(new THREE.ConeGeometry(0.039, 0.16, 4).translate(0.35, 2.35, 0.055), 0x95928a, 2, 0.7)
    if (detailed) {
      for (let row = 0; row < 12; row++) {
        add(new THREE.BoxGeometry(0.47, 0.021, 0.017).translate(-0.30, 0.51 + row * 0.073, 0.357), 0xc4aa6e, -2)
      }
      for (let col = 0; col < 5; col++) {
        add(new THREE.BoxGeometry(0.013, 0.91, 0.014).translate(-0.51 + col * 0.105, 0.93, 0.367), 0x71603f, -2)
      }
      const bowPoints = Array.from({ length: 13 }, (_, i) => {
        const y = -0.57 + i / 12 * 1.14
        return new THREE.Vector3(0.26 + 0.13 * Math.cos(y * 3.1), 1.16 + y, -0.28)
      })
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bowPoints), 12, 0.016, 4, false), 0xb79760)
      for (let i = 0; i < 4; i++) add(cylinder(0.009, 0.009, 0.32, 0.18 + i * 0.028, 1.65, -0.23), 0xd3bc8e)
      add(new THREE.BoxGeometry(0.45, 0.035, 0.36).translate(0, 1.07, 0), 0xc5a363)
    }
  }
  const merged = mergeGeometries(pieces, false)!
  for (const p of pieces) p.dispose()
  merged.scale(FIGURE_SIZE, FIGURE_SIZE, FIGURE_SIZE)
  return merged
}

/** Shared rig for walking, breathing and the different reflectance of bronze and cloth. */
export function soldierMaterial(time: { value: number }) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.83, metalness: 0.1 })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.marchTime = time
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      attribute float gait;
      attribute float metal;
      attribute vec2 motion;
      varying float vMetal;
      uniform float marchTime;
      mat2 joint(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
      float jointAngle() {
        float stride = sin(marchTime * 6.2 + motion.x);
        return abs(gait) < 1.5 ? stride * gait * .42 * motion.y : -stride * sign(gait) * .12 * motion.y;
      }`)
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      if (gait != 0.0) objectNormal.yz = joint(jointAngle()) * objectNormal.yz;`)
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vMetal = metal;
      if (gait != 0.0) {
        float pivot = abs(gait) < 1.5 ? 1.25 : 2.12;
        transformed.y -= pivot;
        transformed.yz = joint(jointAngle()) * transformed.yz;
        transformed.y += pivot;
      }
      transformed.y += (1.0 - cos(marchTime * 12.4 + motion.x * 2.0)) * .035 * motion.y;
      transformed.z += sin(marchTime * 1.5 + motion.x) * .009 * smoothstep(.9, 2.4, position.y);`)
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vMetal;')
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(.89, .38, vMetal);')
    shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vMetal;')
  }
  material.customProgramCacheKey = () => 'thermopylae-articulated-v2'
  return material
}
