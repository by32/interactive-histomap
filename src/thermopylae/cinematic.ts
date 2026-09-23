import { stageFingerprint } from './fingerprint'
import { STILL_SECONDS, type Stage } from './script'

/** written by scripts/thermopylae/encode-stills.mjs */
interface StillsManifest {
  width: number
  height: number
  stages: Record<string, { fingerprint: string; avif: Record<string, string>; webp: Record<string, string> }>
}

export type StillState = 'off' | 'none' | 'stale' | 'aspect' | 'waiting' | 'shown'

const BASE = `${import.meta.env.BASE_URL}thermopylae/stills/`

/**
 * Cycles stills of the walkthrough's steps (scripts/blender/stills.py), rendered
 * from exactly the page's cameras. Once a step has settled and the viewer has
 * not moved the camera, the still fades in over the live view; any interaction
 * fades it out again. It is shown only when it lines up exactly: the step's
 * fingerprint still matches, the camera sits where the still was rendered, and
 * the window is no wider than the render (object-fit: cover then crops only
 * the sides, which is how three.js's vertical field of view widens too).
 */
export class Cinematic {
  state: StillState = 'none'
  private on = true
  private manifest: StillsManifest | null = null
  private stage: Stage | null = null
  private arrivedAt = 0
  private interacted = false
  private decoded = ''
  private readonly img: HTMLImageElement
  private readonly avif: HTMLSourceElement
  private readonly picture: HTMLPictureElement

  constructor(picture: HTMLPictureElement) {
    this.picture = picture
    this.img = picture.querySelector('img')!
    this.avif = picture.querySelector('source')!
    fetch(`${BASE}manifest.json`)
      .then((r) => (r.ok ? (r.json() as Promise<StillsManifest>) : null))
      .then((m) => {
        this.manifest = m
        if (this.stage) this.arrive(this.stage)
      })
      .catch(() => {})
  }

  private entry(stage: Stage) {
    const e = this.manifest?.stages[stage.id]
    return e && e.fingerprint === stageFingerprint(stage) ? e : null
  }

  /** a step was entered; true if a matching still exists (the page then holds
   * marching columns at the still's moment) */
  arrive(stage: Stage): boolean {
    this.stage = stage
    this.arrivedAt = performance.now()
    this.interacted = false
    this.hide()
    const e = this.entry(stage)
    if (!e) return false
    const srcset = (files: Record<string, string>) =>
      Object.entries(files)
        .map(([w, f]) => `${BASE}${f} ${w}w`)
        .join(', ')
    this.avif.srcset = srcset(e.avif)
    this.img.srcset = srcset(e.webp)
    const key = this.img.srcset
    this.img
      .decode()
      .then(() => {
        if (this.img.srcset === key) this.decoded = key
      })
      .catch(() => {})
    return true
  }

  get enabled() {
    return this.on
  }

  /** turn stills on or off; takes effect at once, not on the next frame */
  set enabled(on: boolean) {
    this.on = on
    if (!on) this.setState('off')
    else if (this.state === 'off') this.setState('waiting')
  }

  private setState(state: StillState) {
    this.state = state
    document.body.dataset.still = state
    this.picture.classList.toggle('on', state === 'shown')
  }

  /** the viewer took the camera: back to the live view until the next step */
  interrupt() {
    this.interacted = true
    this.hide()
  }

  private hide() {
    this.picture.classList.remove('on')
  }

  update(o: { film: boolean; modern: boolean; settled: boolean; cameraAtStage: boolean; width: number; height: number }) {
    const stage = this.stage
    let state: StillState
    if (!this.on) state = 'off'
    else if (!stage || !this.manifest?.stages[stage.id]) state = 'none'
    else if (!this.entry(stage)) state = 'stale'
    else if (o.width / o.height > (this.manifest.width / this.manifest.height) * 1.005) state = 'aspect'
    else if (
      o.film ||
      o.modern ||
      this.interacted ||
      !o.settled ||
      !o.cameraAtStage ||
      this.decoded !== this.img.srcset ||
      performance.now() - this.arrivedAt < STILL_SECONDS * 1000
    )
      state = 'waiting'
    else state = 'shown'
    if (state !== this.state) {
      this.setState(state)
      // size the request to the rendered height: cover crops the width
      this.img.sizes = this.avif.sizes = `${Math.round(o.height * (this.manifest ? this.manifest.width / this.manifest.height : 2.37))}px`
    }
  }
}
