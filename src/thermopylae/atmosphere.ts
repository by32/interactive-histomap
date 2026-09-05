import * as THREE from 'three'
import { heightAt, shoreline, modernShore, EXTENT } from './terrain'
import type { LightPreset } from './scene'

const noise = `
  float hash31(vec3 p) { return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
  float stoneNoise(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
      mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
`

/** World-space limestone strata and granular ground, with derivative bump detail. */
export function limestoneMaterial(vertexColors = true) {
  const material = new THREE.MeshStandardMaterial({ vertexColors, color: vertexColors ? 0xffffff : 0x9b9684, roughness: 0.96 })
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGround; varying vec3 vGroundNormal;')
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvGround = (modelMatrix * vec4(position, 1.0)).xyz; vGroundNormal = normalize(mat3(modelMatrix) * normal);')
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vGround; varying vec3 vGroundNormal;\n${noise}`)
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float coarse = stoneNoise(vGround * .055);
      float grain = stoneNoise(vGround * .7);
      float strata = pow(.5 + .5*sin(vGround.y * .62 + coarse * 9.0), 7.0);
      float cliff = 1.0 - smoothstep(.55, .93, abs(normalize(vGroundNormal).y));
      diffuseColor.rgb *= .78 + coarse * .36 + grain * .18;
      diffuseColor.rgb *= 1.0 - strata * .23 * cliff;
    `)
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      float relief = stoneNoise(vGround * .31) * .32 + stoneNoise(vGround * 1.3) * .09;
      normal = normalize(normal - vec3(dFdx(relief), dFdy(relief), 0.0) * 1.8);
    `)
  }
  material.customProgramCacheKey = () => 'limestone-strata-v2'
  return material
}

export function flowingWater() {
  const time = { value: 0 }
  const modern = { value: 0 }
  // Store both coastlines in one linearly filtered, 16-bit-per-coast texture.
  // Foam belongs to the water shader: no almost-coplanar transparent overlay.
  const samples = 2048
  const data = new Uint8Array(samples * 4)
  for (let i = 0; i < samples; i++) {
    const x = EXTENT.xMin + i / (samples - 1) * (EXTENT.xMax - EXTENT.xMin)
    for (const [j, coast] of [shoreline(x), modernShore(x)].entries()) {
      const value = Math.round((coast + 6000) / 9000 * 65535)
      data[i * 4 + j * 2] = value >> 8
      data[i * 4 + j * 2 + 1] = value & 255
    }
  }
  const coastMap = new THREE.DataTexture(data, samples, 1, THREE.RGBAFormat)
  coastMap.minFilter = coastMap.magFilter = THREE.LinearFilter
  coastMap.needsUpdate = true
  const material = new THREE.MeshStandardMaterial({ color: 0x28736e, roughness: 0.48, metalness: 0.12 })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.waterTime = time
    shader.uniforms.coastMap = { value: coastMap }
    shader.uniforms.modernCoast = modern
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWater;')
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWater = (modelMatrix * vec4(position,1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWater;
      uniform float waterTime;
      uniform sampler2D coastMap;
      uniform float modernCoast;
      // Average away ripples smaller than a pixel rather than letting specular
      // highlights shimmer as the camera or adaptive pixel ratio changes.
      float filteredCos(float phase) { return cos(phase) * (1.0 - smoothstep(.7, 3.0, fwidth(phase))); }
    `)
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      vec2 p = vWater.xz;
      float t = waterTime;
      float waveX = filteredCos(p.x*.14 + p.y*.07 + t*.7)*.027 + filteredCos(p.x*.63-p.y*.21+t*1.2)*.012;
      float waveZ = filteredCos(p.y*.18-p.x*.04+t*.6)*.024 + filteredCos(p.y*.49+p.x*.29-t*.9)*.010;
      normal = normalize((viewMatrix * vec4(-waveX, 1.0, -waveZ, 0.0)).xyz);
    `)
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float coastU = clamp((vWater.x + 3600.0) / 6600.0, 0.0, 1.0);
      vec4 encoded = texture2D(coastMap, vec2((coastU * 2047.0 + .5) / 2048.0, .5));
      vec2 pair = mix(encoded.rg, encoded.ba, modernCoast);
      float coastZ = dot(pair, vec2(256.0, 1.0)) * (255.0 / 65535.0) * 9000.0 - 6000.0;
      float offshore = coastZ - vWater.z;
      float footprint = max(1.0, fwidth(offshore));
      float shoreWidth = 4.5 + footprint;
      float foam = (1.0 - smoothstep(1.5, shoreWidth, abs(offshore - 4.0))) * (4.5 / shoreWidth);
      foam *= .30 + .06 * filteredCos(vWater.x * .055 + waterTime * .38);
      float inMap = step(-3600.0, vWater.x) * step(vWater.x, 3000.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.19,.40,.34), (1.0 - smoothstep(0.0,45.0,offshore)) * .35 * inMap);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.64,.73,.63), foam * inMap);
    `)
  }
  material.customProgramCacheKey = () => 'water-integrated-coast-v3'
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000).rotateX(-Math.PI / 2), material)
  mesh.name = 'sea'
  return { mesh, time, modern }
}

/** Stars and sparse fireflies/embers are particles, not an image of the sky. */
export function nightSky() {
  const positions: number[] = []
  let seed = 37
  const random = () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed / 4294967296 }
  for (let i=0;i<900;i++) {
    const a=random()*Math.PI*2, h=.12+random()*.88, r=Math.sqrt(1-h*h)
    positions.push(Math.cos(a)*r*19000,h*19000,Math.sin(a)*r*19000)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3))
  const material=new THREE.PointsMaterial({color:0xbbcce4,size:1.5,sizeAttenuation:false,transparent:true,opacity:0,depthWrite:false})
  const mesh=new THREE.Points(g,material)
  return {mesh,material}
}

export function softenPoints(material: THREE.PointsMaterial) {
  material.blending=THREE.AdditiveBlending
  material.onBeforeCompile=(shader)=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float radius=length(gl_PointCoord-.5)*2.0;
      if(radius>1.0) discard;
      diffuseColor.a *= pow(1.0-radius,2.0);
      diffuseColor.rgb *= 1.0 + 2.0*pow(1.0-radius,8.0);`)
  }
}

export function focusLight(light: THREE.DirectionalLight, target: THREE.Vector3, eye: THREE.Vector3, preset: LightPreset) {
  const radius=THREE.MathUtils.clamp(eye.distanceTo(target)*.7,95,1400)
  light.target.position.copy(target)
  light.position.copy(target).addScaledVector(preset.sunDir,2500)
  const c=light.shadow.camera
  c.left=c.bottom=-radius
  c.right=c.top=radius
  c.near=10
  c.far=6000
  c.updateProjectionMatrix()
}

/** Natural scatter at the pass adds near-ground scale without changing geography. */
export function coastalRocks() {
  const g=new THREE.IcosahedronGeometry(1,1)
  const mesh=new THREE.InstancedMesh(g,new THREE.MeshStandardMaterial({color:0x9b967f,roughness:.95}),1500)
  let seed=115
  const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
  const dummy=new THREE.Object3D()
  for(let i=0;i<1500;i++) {
    const x=-2700+rnd()*5300, z=shoreline(x)+15+rnd()*90
    const size=.3+rnd()*1.6
    dummy.position.set(x,heightAt(x,z)-size*.18,z)
    dummy.rotation.set(rnd(),rnd()*6.28,rnd())
    dummy.scale.set(size,size*(.4+rnd()*.7),size*(.7+rnd()))
    dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix)
  }
  mesh.castShadow=mesh.receiveShadow=true
  return mesh
}
