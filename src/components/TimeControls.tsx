import { useEffect } from 'react'
import { useStore } from '../store'

const SPEED_LABELS: Record<number, string> = { 3000: '½×', 1500: '1×', 700: '2×' }

export default function TimeControls() {
  const playing = useStore((s) => s.playing)
  const speedMs = useStore((s) => s.speedMs)
  const timeScaleMode = useStore((s) => s.timeScaleMode)
  const togglePlay = useStore((s) => s.togglePlay)
  const cycleSpeed = useStore((s) => s.cycleSpeed)
  const stepYear = useStore((s) => s.stepYear)
  const setTimeScaleMode = useStore((s) => s.setTimeScaleMode)

  useEffect(() => {
    if (!playing) return
    const interval = setInterval(() => {
      const { yearIndex, timeline, setYearIndex, setPlaying } = useStore.getState()
      if (!timeline || yearIndex >= timeline.years.length - 1) setPlaying(false)
      else setYearIndex(yearIndex + 1)
    }, speedMs)
    return () => clearInterval(interval)
  }, [playing, speedMs])

  return (
    <div className="time-controls">
      <button className="ctrl-btn" onClick={() => stepYear(-1)} title="Previous snapshot (←)" aria-label="Previous snapshot">
        ‹
      </button>
      <button className="ctrl-btn play-btn" onClick={togglePlay} title="Play through history (space)" aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? '❚❚' : '▶'}
      </button>
      <button className="ctrl-btn" onClick={() => stepYear(1)} title="Next snapshot (→)" aria-label="Next snapshot">
        ›
      </button>
      <button
        className="ctrl-btn speed-btn"
        onClick={cycleSpeed}
        title="Playback speed (½× slow · 1× normal · 2× fast)"
        aria-label={`Playback speed ${SPEED_LABELS[speedMs]}`}
      >
        {SPEED_LABELS[speedMs] ?? '1×'}
      </button>
      <button
        className={`scale-toggle${timeScaleMode === 'snapshot' ? ' compressed' : ''}`}
        onClick={() => setTimeScaleMode(timeScaleMode === 'linear' ? 'snapshot' : 'linear')}
        title="Linear: axis distance = real years. Compressed: every snapshot gets equal space."
      >
        {timeScaleMode === 'linear' ? 'linear time' : 'compressed time'}
      </button>
    </div>
  )
}
