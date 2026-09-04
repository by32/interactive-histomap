import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import './style.css'
import { heightAt, modernHeightAt } from './terrain'
import { GROUPS, STAGES, LABELS, FIGURE_SCALE, type Stage } from './script'
import { Armies } from './units'
import { CAMERA_KEYS, FILM_CHAPTERS, LIGHT_KEYS, UNIT_KEYS } from './film'
import { FilmClock, FILM_DURATION, clampTime, interval, smoothstep } from './timeline'
import {
  buildTerrain,
  buildModernFeatures,
  buildModernCoastGhost,
  buildSea,
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
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05

const scene = new THREE.Scene()
scene.fog = new THREE.Fog(0xcdd9e4, 1800, 10500)

const camera = new THREE.PerspectiveCamera(50, 1, 2, 50000)

const controls = new OrbitControls(camera, canvas)
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
scene.add(sun, fill, hemi, ambient)

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
scene.add(buildSea())
scene.add(buildForest())
const camps = buildCamps()
scene.add(camps.tents, camps.fires)
scene.add(buildWall())
scene.add(buildSprings())
const path = buildPath()
scene.add(path)
const armies = new Armies()
scene.add(armies.root)
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
  counterEl.textContent = `${idx + 1} / ${STAGES.length}`
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
  modernCoastGhost.visible = !on
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
  if ((e.target as HTMLElement).closest('input, select, textarea, [contenteditable="true"]')) return
  if (filmActive) {
    if (e.key === 'Escape') exitFilm()
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
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
    else if (e.key === 't') { exitFilm(); setModern(!modern) }
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

/* ---------- one-minute film: one clock drives every layer ---------- */
const filmPanel = $('#cinema')
const scrub = $<HTMLInputElement>('#film-scrub')
const playFilmBtn = $<HTMLButtonElement>('#film-play')
const cameraPath = new THREE.CatmullRomCurve3(CAMERA_KEYS.map((key) => {
  const point = new THREE.Vector3()
  resolve(key.pos, point)
  return point
}), false, 'centripetal')
const targetPath = new THREE.CatmullRomCurve3(CAMERA_KEYS.map((key) => {
  const point = new THREE.Vector3()
  resolve(key.target, point)
  return point
}), false, 'centripetal')

FILM_CHAPTERS.forEach((chapter, index) => {
  const button = document.createElement('button')
  button.textContent = chapter.label
  button.title = `Jump to ${chapter.time} seconds: ${chapter.title}`
  button.addEventListener('click', () => {
    film.playing = false
    film.seek(chapter.time)
    followCamera = !reducedMotion.matches
    filmChapter = index - 1
    renderFilm(true)
  })
  $('#film-chapters').appendChild(button)
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
  const light = interval(LIGHT_KEYS, film.time)
  lerpPreset(LIGHTS[light.from.light], LIGHTS[light.to.light], smoothstep(light.progress), lightNow)
  applyLight(lightNow)
  // A tiny deterministic flicker freezes and rewinds along with the torches.
  armies.setTorchGlow(lightNow.fires * (0.94 + 0.06 * Math.sin(film.time * 11)))
  if (followCamera) {
    const shot = interval(CAMERA_KEYS, film.time)
    const fraction = (shot.index + shot.progress) / (CAMERA_KEYS.length - 1)
    cameraPath.getPoint(fraction, camera.position)
    targetPath.getPoint(fraction, controls.target)
    camera.position.y = Math.max(camera.position.y, heightAt(camera.position.x, camera.position.z) + 25)
    controls.update()
  }
  const chapterIndex = FILM_CHAPTERS.findLastIndex((chapter) => film.time >= chapter.time)
  const chapter = FILM_CHAPTERS[chapterIndex]
  if (filmChapter !== chapterIndex) {
    filmChapter = chapterIndex
    $('#film-kicker').textContent = STAGES[chapter.stage].kicker
    $('#film-title').textContent = chapter.title
    $('#film-caption').textContent = chapter.caption
    Array.from($('#film-chapters').children).forEach((el, i) => {
      if (i === chapterIndex) el.setAttribute('aria-current', 'step')
      else el.removeAttribute('aria-current')
    })
    document.body.dataset.stage = STAGES[chapter.stage].id
  }
  scrub.value = String(film.time)
  const seconds = Math.floor(film.time)
  const stamp = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  $('#film-time').textContent = `${stamp} / 1:00`
  scrub.setAttribute('aria-valuetext', `${stamp} of 1:00, ${chapter.label}`)
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
  material.emissiveIntensity = 1.1
  material.opacity = 1
  // Reduced-motion mode uses the existing overview while the viewer controls the camera.
  if (!followCamera) {
    resolve(STAGES[6].camera.pos, camera.position)
    resolve(STAGES[6].camera.target, controls.target)
    controls.update()
  }
  renderFilm(true)
}

function exitFilm() {
  const stage = FILM_CHAPTERS[Math.max(0, filmChapter)].stage
  filmActive = false
  film.playing = false
  filmPanel.hidden = true
  $('#panel').hidden = false
  delete document.body.dataset.mode
  delete document.body.dataset.playing
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
  }
}

const timer = new THREE.Timer()
const camDir = new THREE.Vector3()
function frame() {
  timer.update()
  const dt = Math.min(0.1, timer.getDelta())
  resize()

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

  updateLabels()
  // flag quiet frames for tests and screenshots
  const settled = filmActive ? !film.playing : camK >= 1 && lightK >= 1 && armies.settled
  if (document.body.dataset.settled !== String(settled)) document.body.dataset.settled = String(settled)
  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

/* ---------- boot ---------- */
applyLight(lightNow)
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
document.body.classList.add('ready')
frame()
