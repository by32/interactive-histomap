/** Shared, seekable time. Rendering never depends on which frames came before. */
export const FILM_DURATION = 60
export const clampTime = (time: number) => Number.isFinite(time) ? Math.max(0, Math.min(FILM_DURATION, time)) : 0
export const smoothstep = (t: number) => t * t * (3 - 2 * t)

export function interval<T extends { time: number }>(keys: readonly T[], time: number) {
  const t = clampTime(time)
  let index = 0
  while (index < keys.length - 2 && t >= keys[index + 1].time) index++
  const from = keys[index]
  const to = keys[Math.min(index + 1, keys.length - 1)]
  const span = to.time - from.time
  return { from, to, index, progress: span > 0 ? Math.max(0, Math.min(1, (t - from.time) / span)) : 0 }
}

export class FilmClock {
  time = 0
  playing = false
  speed = 1

  seek(time: number) {
    this.time = clampTime(time)
    if (this.time === FILM_DURATION) this.playing = false
  }

  play() {
    if (this.time === FILM_DURATION) this.time = 0
    this.playing = true
  }

  tick(dt: number) {
    if (this.playing && Number.isFinite(dt) && dt > 0) this.seek(this.time + dt * this.speed)
  }
}
