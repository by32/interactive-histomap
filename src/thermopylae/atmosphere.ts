import * as THREE from 'three'
import { heightAt, shoreline, EXTENT } from './terrain'
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
  const material = new THREE.MeshStandardMaterial({ color: 0x28736e, roughness: 0.27, metalness: 0.35, transparent: true, opacity: 0.86 })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.waterTime = time
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWater;')
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWater = (modelMatrix * vec4(position,1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWater;
      uniform float waterTime;
    `)
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      vec2 p = vWater.xz;
      float t = waterTime;
      float waveX = cos(p.x*.14 + p.y*.07 + t*.7)*.045 + cos(p.x*.63-p.y*.21+t*1.2)*.025;
      float waveZ = cos(p.y*.18-p.x*.04+t*.6)*.038 + cos(p.y*.49+p.x*.29-t*.9)*.021;
      normal = normalize((viewMatrix * vec4(-waveX, 1.0, -waveZ, 0.0)).xyz);
    `)
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float ripple = sin(vWater.x*.18+vWater.z*.11+waterTime*.8)*sin(vWater.z*.22-waterTime*.6);
      diffuseColor.rgb *= .94 + .06 * ripple;
    `)
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000).rotateX(-Math.PI / 2), material)
  mesh.name = 'sea'
  return { mesh, time }
}

/** A thin irregular band of foam, located on the reconstructed ancient shoreline. */
export function shorelineFoam() {
  const n = 1100
  const vertices = new Float32Array((n + 1) * 2 * 3)
  const indices: number[] = []
  for (let i = 0; i <= n; i++) {
    const x = EXTENT.xMin + i / n * (EXTENT.xMax - EXTENT.xMin)
    const z = shoreline(x) - 2
    vertices.set([x, .15, z - 4.5, x, .18, z + 1.8], i * 6)
    if (i < n) { const a = i * 2; indices.push(a,a+2,a+1,a+1,a+2,a+3) }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  g.setIndex(indices)
  const time = { value: 0 }
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { time },
    vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform float time;
      void main(){ float bands = sin(vP.x*.14 + vP.z*.23 + time*.7); float grain = fract(sin(dot(floor(vP.xz*1.6),vec2(12.9898,78.233)))*43758.5453);
      gl_FragColor=vec4(.74,.85,.76,(.08+.12*bands)*grain);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  })
  return { mesh: new THREE.Mesh(g,m), time }
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
