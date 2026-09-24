/** written next to the videos by scripts/thermopylae/stitch.mjs; served when the
 * render-film workflow has published a film (see .github/workflows) */
import { filmFingerprint } from './fingerprint'

interface RenderedFilm {
  fingerprint?: string
  start: number
  duration: number
  sources: { src: string; type: string }[]
  poster: string
  chapters: string
}

const BASE = `${import.meta.env.BASE_URL}thermopylae/film/`

/**
 * Offers the Cycles-rendered version of the battle film, when one exists.
 * `onOpen` pauses the interactive film; the video starts at the moment the
 * interactive film had reached.
 */
export function setupRenderedFilm(currentTime: () => number, onOpen: () => void) {
  const button = document.querySelector<HTMLButtonElement>('#rendered-film-open')!
  const dialog = document.querySelector<HTMLDialogElement>('#rendered-film')!
  const video = document.querySelector<HTMLVideoElement>('#rendered-film-video')!
  let film: RenderedFilm | null = null
  fetch(`${BASE}film.json`)
    .then((r) => (r.ok ? (r.json() as Promise<RenderedFilm>) : null))
    // checking it lays out every formation of the film: wait for a quiet moment
    .then((f) => new Promise<RenderedFilm | null>((resolve) => 'requestIdleCallback' in window ? requestIdleCallback(() => resolve(f)) : setTimeout(() => resolve(f))))
    .then((f) => {
      // a render of an earlier version of the battle is not offered
      if (!f || f.fingerprint !== filmFingerprint()) return
      film = f
      video.poster = `${BASE}${f.poster}`
      for (const s of f.sources) {
        const source = document.createElement('source')
        source.src = `${BASE}${s.src}`
        source.type = s.type
        video.append(source)
      }
      const track = document.createElement('track')
      track.kind = 'chapters'
      track.src = `${BASE}${f.chapters}`
      track.default = true
      video.append(track)
      button.hidden = false
      document.body.dataset.renderedFilm = 'available'
    })
    .catch(() => {})
  button.addEventListener('click', () => {
    if (!film) return
    onOpen()
    dialog.showModal()
    const t = currentTime() - film.start
    video.addEventListener('loadedmetadata', () => { video.currentTime = Math.max(0, Math.min(film!.duration, t)) }, { once: true })
    video.preload = 'auto'
    video.load()
  })
  const close = () => {
    video.pause()
    dialog.close()
  }
  document.querySelector('#rendered-film-close')!.addEventListener('click', close)
  dialog.addEventListener('close', () => video.pause())
}
