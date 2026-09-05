import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { flowingWater, nightSky, focusLight, coastalRocks } from './atmosphere'
import { BattleEffects } from './battle'
import { AtlasRenderer } from './atlas-renderer'
import { setupEvidence } from './evidence'
import './style.css'
import { heightAt, modernHeightAt } from './terrain'
import { GROUPS, STAGES, LABELS, FIGURE_SCALE, type Stage } from './script'
import { Armies } from './units'
import { FILM_CHAPTERS, LIGHT_KEYS, UNIT_KEYS } from './film'
import { FilmCamera } from './film-camera'
import { FilmClock, FILM_DURATION, clampTime, interval, smoothstep } from './timeline'
import {
  buildTerrain,
  buildModernFeatures,
  buildModernCoastGhost,
  buildSky,
  buildForest,
  buildCamps,
  buildWall,
  buildPath,
  buildSprings,
  LIGHTS,
  lerpPreset,
  clonePreset,
  type LightPreset,
} from './scene'

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!

/* ---------- renderer & scene ---------- */
const canvas = $<HTMLCanvasElement>('#scene')
let gpu: THREE.WebGLRenderer | null = null
try { gpu = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }) } catch { /* The relief atlas keeps the story usable on devices without WebGL. */ }
const renderer = gpu ?? new AtlasRenderer(canvas)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 760 ? 1.35 : 1.75))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.08

const scene = new THREE.Scene()
scene.fog = new THREE.Fog(0xcdd9e4, 1800, 10500)

const camera = new THREE.PerspectiveCamera(46, 1, 2, 50000)
let composer: EffectComposer | null = null
if (gpu) {
  gpu.shadowMap.enabled = true
  gpu.shadowMap.type = THREE.PCFSoftShadowMap
  // The composer renders offscreen, so renderer antialias alone cannot smooth
  // the sea/terrain intersection. Multisample the actual scene target.
  const target = new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:Math.min(4,gpu.capabilities.maxSamples)})
  composer = new EffectComposer(gpu,target)
  composer.addPass(new RenderPass(scene,camera))
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1,1),.19,.5,1.05))
  composer.addPass(new OutputPass())
}
const updateEvidence = setupEvidence()

const controls = new OrbitControls(camera, canvas)
controls.enabled = Boolean(gpu)
controls.enableDamping = true
controls.dampingFactor = 0.08
controls.minDistance = 12
controls.maxDistance = 9000
controls.maxPolarAngle = Math.PI * 0.49
controls.screenSpacePanning = false

const sun = new THREE.DirectionalLight(0xffffff, 2.4)
// a cool fill from over the gulf so north-facing cliffs are not pitch black
const fill = new THREE.DirectionalLight(0xcfdcec, 0.55)
fill.position.set(-1500, 3000, -6000)
const hemi = new THREE.HemisphereLight(0xbcd6ee, 0x6b6046, 0.75)
const ambient = new THREE.AmbientLight(0xffffff, 0.3)
sun.castShadow = true
sun.shadow.mapSize.set(2048,2048)
sun.shadow.bias = -.00025
sun.shadow.normalBias = .35
sun.shadow.radius = 2
scene.add(sun, sun.target, fill, hemi, ambient)

const sky = buildSky()
scene.add(sky.mesh)
const terrainAncient = buildTerrain(false)
scene.add(terrainAncient)
const modernCoastGhost = buildModernCoastGhost()
scene.add(modernCoastGhost)
// today's ground is built the first time it is asked for
let terrainModern: THREE.Mesh | null = null
let modernFeatures: THREE.Group | null = null
let modern = false
/** the ground under the current topography */
let groundAt: (x: number, z: number) => number = heightAt
const water = flowingWater()
const stars = nightSky()
scene.add(water.mesh, stars.mesh)
scene.add(coastalRocks())
scene.add(buildForest())
const camps = buildCamps()
scene.add(camps.tents, camps.fires)
scene.add(buildWall())
scene.add(buildSprings())
const path = buildPath()
scene.add(path)
const armies = new Armies()
scene.add(armies.root)
const battleEffects = new BattleEffects()
scene.add(battleEffects.root)
const torchLights = Array.from({length:3}, () => new THREE.PointLight(0xffa34b,0,38,1.7))
scene.add(...torchLights)
const film = new FilmClock()
let filmActive = false
let followCamera = true
let previousTopography = false
let filmChapter = -1
let renderedFilmTime = -1
let hashSecond = -1
let filmPrepared = false
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

/* ---------- lighting transitions ---------- */
let lightFrom: LightPreset = clonePreset(LIGHTS.day)
let lightTo: LightPreset = LIGHTS.day
let lightK = 1
const lightNow: LightPreset = clonePreset(LIGHTS.day)
const LIGHT_S = 2.4

function applyLight(p: LightPreset) {
  sun.position.copy(p.sunDir).multiplyScalar(5000)
  stars.material.opacity = p.fires * .8
  scene.environmentIntensity = .45 - p.fires * .28
  sun.color.copy(p.sunColor)
  sun.intensity = p.sunIntensity
  fill.intensity = 0.22 * p.sunIntensity
  hemi.color.copy(p.hemiSky)
  hemi.groundColor.copy(p.hemiGround)
  hemi.intensity = p.hemiIntensity
  ambient.intensity = 0.12 * p.sunIntensity
  sky.uniforms.top.value.copy(p.skyTop)
  sky.uniforms.bottom.value.copy(p.skyBottom)
  sky.uniforms.fog.value.copy(p.fog)
  sky.uniforms.sun.value.copy(p.sunDir)
  sky.uniforms.glow.value = 1 - p.fires * .94
  const fog = scene.fog as THREE.Fog
  fog.color.copy(p.fog)
  fog.near = p.fogNear
  fog.far = p.fogFar
  ;(camps.fires.material as THREE.PointsMaterial).opacity = p.fires
  camps.fires.visible = p.fires > 0.01
  armies.setTorchGlow(p.fires)
}

/* ---------- camera tour ---------- */
const camFrom = { pos: new THREE.Vector3(), target: new THREE.Vector3() }
const camTo = { pos: new THREE.Vector3(), target: new THREE.Vector3() }
let camK = 1
const CAM_S = 3.2
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

const resolve = ([x, z, up]: [number, number, number], out: THREE.Vector3) =>
  out.set(x, heightAt(x, z) + up, z)

function flyTo(stage: Stage) {
  camFrom.pos.copy(camera.position)
  camFrom.target.copy(controls.target)
  resolve(stage.camera.pos, camTo.pos)
  resolve(stage.camera.target, camTo.target)
  camK = 0
}

// any pointer interaction hands the camera back to the viewer
canvas.addEventListener('pointerdown', () => {
  camK = 1
  exploreFilm()
})
canvas.addEventListener('wheel', () => {
  camK = 1
  exploreFilm()
}, { passive: true })

/* ---------- labels ---------- */
const labelLayer = $('#labels')
const labelEls = LABELS.map((l) => {
  const el = document.createElement('div')
  el.className = 'label' + (l.minor ? ' minor' : '')
  el.textContent = l.text
  labelLayer.appendChild(el)
  const ground = l.mode === 'modern' ? modernHeightAt : heightAt
  return { el, mode: l.mode, pos: new THREE.Vector3(l.x, ground(l.x, l.z) + (l.up ?? 6), l.z) }
})
let labelsOn = true

const projected = new THREE.Vector3()
const march = new THREE.Vector3()
function occluded(p: THREE.Vector3): boolean {
  // march from the camera toward the label; hidden if the ground is above the ray
  const steps = 28
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    march.lerpVectors(camera.position, p, t)
    if (groundAt(march.x, march.z) > march.y + 4) return true
  }
  return false
}

function updateLabels() {
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  for (const { el, pos, mode } of labelEls) {
    if (!labelsOn || (mode && mode !== (modern ? 'modern' : 'ancient'))) {
      el.style.display = 'none'
      continue
    }
    projected.copy(pos).project(camera)
    const dist = camera.position.distanceTo(pos)
    const inFront = projected.z < 1 && projected.z > -1
    const onScreen = projected.x > -1.05 && projected.x < 1.05 && projected.y > -1.05 && projected.y < 1.05
    const show = inFront && onScreen && dist < 9000 && !occluded(pos)
    el.style.display = show ? 'block' : 'none'
    if (!show) continue
    el.style.transform = `translate(-50%, -100%) translate(${((projected.x + 1) / 2) * w}px, ${((1 - projected.y) / 2) * h}px)`
    el.style.opacity = String(Math.max(0.35, 1 - dist / 12000))
  }
}

/* ---------- stage UI ---------- */
let current = -1
let autoplay = false
let autoTimer = 0
const AUTO_S = 16

const kickerEl = $('#kicker')
const titleEl = $('#stage-title')
const textEl = $('#stage-text')
const counterEl = $('#counter')
const dotsEl = $('#dots')
const prevBtn = $<HTMLButtonElement>('#prev')
const nextBtn = $<HTMLButtonElement>('#next')
const autoBtn = $<HTMLButtonElement>('#auto')

STAGES.forEach((s, i) => {
  const b = document.createElement('button')
  b.className = 'dot'
  b.title = s.title
  b.setAttribute('aria-label', `Step ${i + 1}: ${s.title}`)
  b.addEventListener('click', () => go(i))
  dotsEl.appendChild(b)
})

function go(i: number, fly = true) {
  const idx = Number.isFinite(i) ? Math.max(0, Math.min(STAGES.length - 1, Math.floor(i))) : 0
  if (idx === current) return
  current = idx
  const stage = STAGES[idx]
  kickerEl.textContent = stage.kicker
  titleEl.textContent = stage.title
  textEl.innerHTML = stage.text
  counterEl.textContent = `${String(idx + 1).padStart(2, '0')} / ${STAGES.length}`
  updateEvidence(idx)
  Array.from(dotsEl.children).forEach((d, k) => d.classList.toggle('on', k === idx))
  prevBtn.disabled = idx === 0
  nextBtn.disabled = idx === STAGES.length - 1
  armies.setStage(stage.units)
  lightFrom = clonePreset(lightNow)
  lightTo = LIGHTS[stage.light]
  lightK = 0
  const pm = path.material as THREE.MeshStandardMaterial
  pm.emissiveIntensity = stage.path ? 1.1 : 0.25
  pm.opacity = stage.path ? 1 : 0.8
  if (fly) flyTo(stage)
  autoTimer = 0
  document.body.dataset.stage = stage.id
  const params = new URLSearchParams(location.hash.slice(1))
  params.set('s', String(idx + 1))
  history.replaceState(null, '', `#${params.toString()}`)
}

prevBtn.addEventListener('click', () => go(current - 1))
nextBtn.addEventListener('click', () => go(current + 1))
autoBtn.addEventListener('click', () => {
  autoplay = !autoplay
  autoBtn.classList.toggle('on', autoplay)
  autoBtn.textContent = autoplay ? '⏸ auto' : '▶ auto'
  autoTimer = 0
})
$('#refly').addEventListener('click', () => {
  if (!gpu) (renderer as AtlasRenderer).resetView()
  if (filmActive) {
    followCamera = true
    renderFilm(true)
  } else flyTo(STAGES[current])
})
/* ---------- topography: 480 BC or today ---------- */
function setModern(on: boolean) {
  if (on && !terrainModern) {
    terrainModern = buildTerrain(true)
    modernFeatures = buildModernFeatures()
    scene.add(terrainModern, modernFeatures)
  }
  modern = on
  groundAt = on ? modernHeightAt : heightAt
  terrainAncient.visible = !on
  modernCoastGhost.visible = !on && !filmActive
  water.modern.value = on ? 1 : 0
  if (terrainModern) terrainModern.visible = on
  if (modernFeatures) modernFeatures.visible = on
  $('#topo-ancient').classList.toggle('on', !on)
  $('#topo-modern').classList.toggle('on', on)
  document.body.dataset.topo = on ? 'today' : '480bc'
  const params = new URLSearchParams(location.hash.slice(1))
  if (on) params.set('t', 'today')
  else params.delete('t')
  history.replaceState(null, '', `#${params.toString()}`)
}
$('#topo-ancient').addEventListener('click', () => { if (filmActive) exitFilm(); setModern(false) })
$('#topo-modern').addEventListener('click', () => { if (filmActive) exitFilm(); setModern(true) })

$('#labels-toggle').addEventListener('click', (e) => {
  labelsOn = !labelsOn
  ;(e.currentTarget as HTMLElement).classList.toggle('on', labelsOn)
})
$('#legend-toggle').addEventListener('click', (e) => {
  const open = $('#legend').classList.toggle('open')
  ;(e.currentTarget as HTMLElement).classList.toggle('on', open)
})
$('#panel-toggle').addEventListener('click', () => {
  $('#panel').classList.toggle('collapsed')
})

window.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return
  // Escape must also work while the scrubber or speed selector has focus.
  if (filmActive && e.key === 'Escape') {
    e.preventDefault()
    exitFilm()
    return
  }
  if ((e.target as HTMLElement).closest('input, select, textarea, [contenteditable="true"]')) return
  if (filmActive) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      film.playing = false
      film.seek(film.time + (e.key === 'ArrowRight' ? 5 : -5))
      renderFilm(true)
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      film.playing = false
      film.seek(e.key === 'Home' ? 0 : FILM_DURATION)
      renderFilm(true)
    } else if (e.key === ' ' && (e.target as HTMLElement).tagName !== 'BUTTON') {
      e.preventDefault()
      toggleFilm()
    } else if (e.key === 'r') $('#film-replay').click()
    else if (e.key === 'l') $('#labels-toggle').click()
    else if (e.key === 't') {
      const nextModern = !modern
      exitFilm()
      setModern(nextModern)
    }
    return
  }
  if (e.key === 'ArrowRight' || e.key === 'PageDown') go(current + 1)
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(current - 1)
  else if (e.key === 'Home') go(0)
  else if (e.key === 'End') go(STAGES.length - 1)
  else if (e.key === 'r') flyTo(STAGES[current])
  else if (e.key === 'l') $('#labels-toggle').click()
  else if (e.key === 't') setModern(!modern)
  else if (e.key === ' ' && (e.target as HTMLElement).tagName !== 'BUTTON') {
    e.preventDefault()
    autoBtn.click()
  }
})

// editing #s=… in the address bar jumps to that step
window.addEventListener('hashchange', () => {
  const params = new URLSearchParams(location.hash.slice(1))
  if (params.has('film')) {
    enterFilm(Number(params.get('film')), false)
    return
  }
  if (filmActive) exitFilm()
  const n = Number(params.get('s'))
  if (Number.isFinite(n) && n >= 1) go(n - 1)
  setModern(params.get('t') === 'today')
})

/* ---------- complete battle: one clock drives every layer ---------- */
const filmPanel = $('#cinema')
const scrub = $<HTMLInputElement>('#film-scrub')
const playFilmBtn = $<HTMLButtonElement>('#film-play')
const filmCamera = new FilmCamera()
const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds) % 60).padStart(2,'0')}`
const chapterSelect = $<HTMLSelectElement>('#film-jump')
scrub.max = String(FILM_DURATION)

FILM_CHAPTERS.forEach((chapter, index) => {
  const button = document.createElement('button')
  button.textContent = chapter.label
  button.dataset.number = String(index+1).padStart(2, '0')
  button.title = `Jump to ${chapter.time} seconds: ${chapter.title}`
  const option = document.createElement('option')
  option.value = String(index)
  option.textContent = `${String(index+1).padStart(2,'0')} · ${chapter.label}`
  chapterSelect.appendChild(option)
  button.addEventListener('click', () => {
    film.playing = false
    film.seek(chapter.time)
    followCamera = !reducedMotion.matches
    filmChapter = index - 1
    renderFilm(true)
  })
  $('#film-chapters').appendChild(button)
})
chapterSelect.addEventListener('change', () => {
  film.playing = false
  film.seek(FILM_CHAPTERS[Number(chapterSelect.value)].time)
  followCamera = !reducedMotion.matches
  renderFilm(true)
})

function updateFilmControls() {
  playFilmBtn.textContent = film.playing ? '⏸ Pause' : film.time === FILM_DURATION ? '▶ Replay' : '▶ Play'
  playFilmBtn.setAttribute('aria-label', film.playing ? 'Pause film' : film.time === FILM_DURATION ? 'Replay film from beginning' : 'Play film')
  playFilmBtn.setAttribute('aria-pressed', String(film.playing))
  const follow = $('#film-follow')
  follow.classList.toggle('on', followCamera)
  follow.setAttribute('aria-pressed', String(followCamera))
  document.body.dataset.playing = String(film.playing)
}

function renderFilm(force = false) {
  if (!filmActive) return
  updateFilmControls()
  if (!force && renderedFilmTime === film.time) return
  renderedFilmTime = film.time
  armies.sampleFilm(film.time)
  battleEffects.sample(film.time,true)
  const light = interval(LIGHT_KEYS, film.time)
  lerpPreset(LIGHTS[light.from.light], LIGHTS[light.to.light], smoothstep(light.progress), lightNow)
  applyLight(lightNow)
  // A tiny deterministic flicker freezes and rewinds along with the torches.
  armies.setTorchGlow(lightNow.fires * (0.94 + 0.06 * Math.sin(film.time * 11)))
  if (followCamera) {
    filmCamera.sample(film.time, camera.position, controls.target)
    controls.update()
  }
  const chapterIndex = FILM_CHAPTERS.findLastIndex((chapter) => film.time >= chapter.time)
  const chapter = FILM_CHAPTERS[chapterIndex]
  if (filmChapter !== chapterIndex) {
    if (!reducedMotion.matches) {
      $('#film-narration').getAnimations().forEach(animation => animation.cancel())
      $('#film-narration').animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 650, easing: 'ease-out' })
      if (filmChapter >= 0 && followCamera) $('#shot-transition').animate([{ opacity: .96 }, { opacity: 0 }], { duration: 620, easing: 'ease-out' })
    }
    filmChapter = chapterIndex
    $('#film-number').textContent = `${String(chapterIndex+1).padStart(2, '0')} / ${FILM_CHAPTERS.length}`
    chapterSelect.value = String(chapterIndex)
    updateEvidence(chapter.stage)
    $('#film-kicker').textContent = STAGES[chapter.stage].kicker
    $('#film-title').textContent = chapter.title
    $('#film-caption').textContent = chapter.caption
    const source = $<HTMLAnchorElement>('#film-source')
    source.href = `https://lexundria.com/hdt/${chapter.source}/mcly`
    source.textContent = `Herodotus ${chapter.source} ↗`
    Array.from($('#film-chapters').children).forEach((el, i) => {
      if (i === chapterIndex) el.setAttribute('aria-current', 'step')
      else el.removeAttribute('aria-current')
    })
    document.body.dataset.stage = STAGES[chapter.stage].id
    document.body.dataset.chapter = chapter.id
    const activeButton = $('#film-chapters').children[chapterIndex] as HTMLElement
    const chapterNav = $('#film-chapters')
    chapterNav.scrollLeft = Math.max(0,activeButton.offsetLeft-chapterNav.offsetLeft-chapterNav.clientWidth/2+activeButton.clientWidth/2)
  }
  scrub.value = String(film.time)
  scrub.style.setProperty('--progress', `${film.time / FILM_DURATION * 100}%`)
  const seconds = Math.floor(film.time)
  const stamp = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  $('#film-time').textContent = `${stamp} / ${formatTime(FILM_DURATION)}`
  scrub.setAttribute('aria-valuetext', `${stamp} of ${formatTime(FILM_DURATION)}, ${chapter.label}`)
  if (force || hashSecond !== seconds) {
    hashSecond = seconds
    const params = new URLSearchParams(location.hash.slice(1))
    params.set('s', String(chapter.stage + 1))
    params.set('film', film.time.toFixed(1))
    params.delete('cam')
    history.replaceState(null, '', `#${params.toString()}`)
  }
}

function enterFilm(time = 0, play = true) {
  if (!filmActive) previousTopography = modern
  if (!filmPrepared) {
    armies.prepareFilm(UNIT_KEYS)
    filmPrepared = true
  }
  filmActive = true
  autoplay = false
  autoBtn.classList.remove('on')
  autoBtn.textContent = '▶ auto'
  camK = lightK = 1
  controls.update()
  controls.enableDamping = false
  setModern(false)
  followCamera = !reducedMotion.matches
  film.seek(clampTime(time))
  film.playing = false
  if (play) film.play()
  filmChapter = -1
  document.body.dataset.mode = 'film'
  $('#panel').hidden = true
  filmPanel.hidden = false
  const material = path.material as THREE.MeshStandardMaterial
  material.emissiveIntensity = .12
  material.opacity = .55
  // Reduced-motion mode uses the existing overview while the viewer controls the camera.
  if (!followCamera) {
    resolve(STAGES[0].camera.pos, camera.position)
    resolve(STAGES[0].camera.target, controls.target)
    controls.update()
  }
  renderFilm(true)
}

function exitFilm() {
  const stage = FILM_CHAPTERS[Math.max(0, filmChapter)].stage
  filmActive = false
  film.playing = false
  battleEffects.sample(0,false)
  filmPanel.hidden = true
  $('#panel').hidden = false
  delete document.body.dataset.mode
  delete document.body.dataset.playing
  delete document.body.dataset.chapter
  controls.enableDamping = true
  const params = new URLSearchParams(location.hash.slice(1))
  params.delete('film')
  history.replaceState(null, '', `#${params.toString()}`)
  current = -1
  go(stage, !reducedMotion.matches)
  armies.setStage(STAGES[stage].units, true)
  setModern(previousTopography)
  $('#watch-film').focus({ preventScroll: true })
}

function exploreFilm() {
  if (!filmActive) return
  film.playing = false
  followCamera = false
  renderFilm(true)
}

function toggleFilm() {
  if (film.playing) film.playing = false
  else film.play()
  renderFilm(true)
}

$('#watch-film').addEventListener('click', () => { enterFilm(); playFilmBtn.focus({ preventScroll: true }) })
$('#exit-film').addEventListener('click', exitFilm)
playFilmBtn.addEventListener('click', toggleFilm)
$('#film-replay').addEventListener('click', () => { followCamera = !reducedMotion.matches; film.seek(0); film.play(); renderFilm(true) })
$('#film-follow').addEventListener('click', () => { followCamera = !followCamera; renderFilm(true) })
$('#film-speed').addEventListener('change', (event) => { film.speed = Number((event.target as HTMLSelectElement).value) })
scrub.addEventListener('input', () => { film.playing = false; film.seek(Number(scrub.value)); renderFilm(true) })
document.addEventListener('evidence-open', () => { if (filmActive) { film.playing = false; updateFilmControls() } autoplay = false; autoBtn.classList.remove('on'); autoBtn.textContent = '▶ auto' })
document.addEventListener('visibilitychange', () => { if (document.hidden && filmActive) { film.playing = false; updateFilmControls() } })

/* ---------- legend ---------- */
const legendList = $('#legend-list')
for (const g of GROUPS) {
  const li = document.createElement('li')
  const sw = document.createElement('i')
  sw.style.background = '#' + g.color.toString(16).padStart(6, '0')
  li.append(sw, g.label)
  li.className = g.side
  legendList.appendChild(li)
}
$('#figure-scale').textContent = String(FIGURE_SCALE)

/* ---------- compass ---------- */
const needle = $('#needle')

/* ---------- loop ---------- */
function resize() {
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    composer?.setSize(w,h)
  }
}

const timer = new THREE.Timer()
const camDir = new THREE.Vector3()
let environmentTime = 0
let qualitySeconds = 0
let qualityFrames = 0
function frame() {
  timer.update()
  const dt = Math.min(0.1, timer.getDelta())
  resize()
  if (!reducedMotion.matches) environmentTime += dt
  const time = filmActive ? film.time : environmentTime
  water.time.value = time

  if (camK < 1) {
    camK = Math.min(1, camK + dt / CAM_S)
    const k = easeInOut(camK)
    camera.position.lerpVectors(camFrom.pos, camTo.pos, k)
    controls.target.lerpVectors(camFrom.target, camTo.target, k)
  }
  // never let the eye sink under the ground
  const floor = groundAt(camera.position.x, camera.position.z) + 3
  if (camera.position.y < floor) camera.position.y = floor
  controls.update()

  if (lightK < 1) {
    lightK = Math.min(1, lightK + dt / LIGHT_S)
    lerpPreset(lightFrom, lightTo, easeInOut(lightK), lightNow)
    applyLight(lightNow)
  }

  if (filmActive) {
    film.tick(dt)
    renderFilm()
  } else armies.update(dt)

  if (autoplay) {
    autoTimer += dt
    if (autoTimer > AUTO_S) {
      if (current < STAGES.length - 1) go(current + 1)
      else autoBtn.click()
    }
  }

  camera.getWorldDirection(camDir)
  // north is −z: rotate the needle so it points toward −z on screen
  const az = Math.atan2(camDir.x, -camDir.z)
  needle.style.transform = `rotate(${(-az * 180) / Math.PI}deg)`

  if (gpu) updateLabels()
  else (renderer as AtlasRenderer).showLabels = labelsOn
  // flag quiet frames for tests and screenshots
  const settled = filmActive ? !film.playing : camK >= 1 && lightK >= 1 && armies.settled
  if (document.body.dataset.settled !== String(settled)) document.body.dataset.settled = String(settled)
  if (gpu) {
    armies.updateDetail(camera.position)
    if (lightNow.fires > .05) {
      const torches = armies.torches.geometry.getAttribute('position')
      const nearest: {i:number;d:number}[] = []
      for(let i=0;i<torches.count;i+=3) {
        const d=(torches.getX(i)-camera.position.x)**2+(torches.getY(i)-camera.position.y)**2+(torches.getZ(i)-camera.position.z)**2
        if(d<250*250) nearest.push({i,d})
      }
      nearest.sort((a,b)=>a.d-b.d)
      torchLights.forEach((light,j)=>{
        const pick=nearest[j*3]
        light.intensity=pick?42*lightNow.fires*(.9+.1*Math.sin(time*9+j)):0
        if(pick)light.position.fromBufferAttribute(torches,pick.i)
      })
    } else torchLights.forEach(light=>{light.intensity=0})
    focusLight(sun, controls.target, camera.position, lightNow)
    composer!.render()
    qualitySeconds += dt; qualityFrames++
    if (qualityFrames === 180) {
      if (qualitySeconds > 6.7 && renderer.getPixelRatio() > 1) {
        renderer.setPixelRatio(Math.max(1,renderer.getPixelRatio()-.25))
        composer!.setPixelRatio(renderer.getPixelRatio())
      }
      qualityFrames=0; qualitySeconds=0
    }
  } else renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

/* ---------- boot ---------- */
applyLight(lightNow)
if (gpu) {
  const environmentScene = new THREE.Scene()
  environmentScene.add(sky.mesh.clone())
  const pmrem = new THREE.PMREMGenerator(gpu)
  scene.environment = pmrem.fromScene(environmentScene,.06,.1,50000).texture
  pmrem.dispose()
}
const params = new URLSearchParams(location.hash.slice(1))
const fromHash = Number(params.get('s'))
const start = Number.isFinite(fromHash) && fromHash >= 1 ? Math.min(STAGES.length - 1, Math.floor(fromHash) - 1) : 0
go(start, false)
// snap the camera to the opening view, then let the loop take over
resolve(STAGES[start].camera.pos, camera.position)
resolve(STAGES[start].camera.target, controls.target)
// #cam=x,z,up,tx,tz,tup overrides the viewpoint (handy when tuning a step)
const cam = params.get('cam')?.split(',').map(Number)
if (cam && cam.length === 6 && cam.every(Number.isFinite)) {
  resolve([cam[0], cam[1], cam[2]], camera.position)
  resolve([cam[3], cam[4], cam[5]], controls.target)
}
setModern(params.get('t') === 'today')
if (params.has('film')) enterFilm(Number(params.get('film')), false)
else if (!params.has('s') && !params.has('t')) enterFilm(0, !reducedMotion.matches)
document.body.classList.add('ready')
frame()
