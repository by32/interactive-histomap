import { useEffect } from 'react'
import { useStore } from '../store'

const PLAY_STEP_MS = 700

export default function TimeControls() {
  const playing = useStore((s) => s.playing)
  const timeScaleMode = useStore((s) => s.timeScaleMode)
  const togglePlay = useStore((s) => s.togglePlay)
  const stepYear = useStore((s) => s.stepYear)
  const setTimeScaleMode = useStore((s) => s.setTimeScaleMode)

  useEffect(() => {
    if (!playing) return
    const interval = setInterval(() => {
      const { yearIndex, timeline, setYearIndex, setPlaying } = useStore.getState()
      if (!timeline || yearIndex >= timeline.years.length - 1) setPlaying(false)
      else setYearIndex(yearIndex + 1)
    }, PLAY_STEP_MS)
    return () => clearInterval(interval)
  }, [playing])

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
        className={`scale-toggle${timeScaleMode === 'snapshot' ? ' compressed' : ''}`}
        onClick={() => setTimeScaleMode(timeScaleMode === 'linear' ? 'snapshot' : 'linear')}
        title="Linear: axis distance = real years. Compressed: every snapshot gets equal space."
      >
        {timeScaleMode === 'linear' ? 'linear time' : 'compressed time'}
      </button>
    </div>
  )
}
