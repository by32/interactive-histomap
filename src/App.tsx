import { useEffect, useRef, useState } from 'react'
import { useStore } from './store'
import { useOrientation } from './lib/useOrientation'
import type { EntityIndex, Timeline } from './types'
import Header from './components/Header'
import MapView from './components/MapView'
import RibbonPanel from './components/RibbonPanel'
import InfoPanel from './components/InfoPanel'
import AboutModal from './components/AboutModal'
import Tooltip from './components/Tooltip'
import { initUrlState, syncUrlState } from './lib/urlState'

const DEFAULT_RIBBON_W = 330
const DEFAULT_RIBBON_H = 250
const readStored = (key: string, fallback: number): number => {
  try {
    const v = Number(localStorage.getItem(key))
    return Number.isFinite(v) && v > 0 ? v : fallback
  } catch {
    return fallback
  }
}

export default function App() {
  const [error, setError] = useState<string | null>(null)
  const loaded = useStore((s) => s.timeline !== null)
  const orientation = useOrientation()
  const vertical = orientation === 'vertical'
  const [ribbonW, setRibbonW] = useState(() => readStored('histomap-ribbon-w', DEFAULT_RIBBON_W))
  const [ribbonH, setRibbonH] = useState(() => readStored('histomap-ribbon-h', DEFAULT_RIBBON_H))
  const mainRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const clampW = (w: number) =>
    Math.max(200, Math.min(Math.round(window.innerWidth * 0.6), Math.round(w)))
  const clampH = (h: number) =>
    Math.max(140, Math.min(Math.round(window.innerHeight * 0.65), Math.round(h)))

  const onDividerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !mainRef.current) return
    const rect = mainRef.current.getBoundingClientRect()
    if (vertical) {
      const w = clampW(e.clientX - rect.left)
      setRibbonW(w)
      try {
        localStorage.setItem('histomap-ribbon-w', String(w))
      } catch { /* private mode */ }
    } else {
      const h = clampH(rect.bottom - e.clientY)
      setRibbonH(h)
      try {
        localStorage.setItem('histomap-ribbon-h', String(h))
      } catch { /* private mode */ }
    }
  }

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    Promise.all([
      fetch(`${base}data/timeline.json`).then((r) => r.json() as Promise<Timeline>),
      fetch(`${base}data/entities.json`).then((r) => r.json() as Promise<EntityIndex>),
    ])
      .then(([timeline, entities]) => {
        useStore.getState().setData(timeline, entities)
        // open where the 1931 original does unless the URL pins a year;
        // deep time (back to 10,000 BC) is a scrub away
        if (!new URLSearchParams(location.hash.slice(1)).has('y'))
          useStore.getState().setYearIndex(Math.max(0, timeline.years.indexOf(-2000)))
        initUrlState()
        return syncUrlState()
      })
      .catch((err) => setError(String(err)))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      const { stepYear, togglePlay } = useStore.getState()
      if (e.key === 'ArrowLeft') stepYear(-1)
      else if (e.key === 'ArrowRight') stepYear(1)
      else if (e.key === ' ') {
        e.preventDefault()
        togglePlay()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (error)
    return (
      <div className="boot-screen">
        <p>Failed to load data: {error}</p>
      </div>
    )
  if (!loaded)
    return (
      <div className="boot-screen">
        <h1>The Interactive Histomap</h1>
        <p>Loading four thousand years…</p>
      </div>
    )
  return (
    <div className="app">
      <Header />
      <div
        className="main"
        ref={mainRef}
        style={
          vertical
            ? { gridTemplateColumns: `${clampW(ribbonW)}px 8px 1fr`, gridTemplateRows: 'minmax(0, 1fr)' }
            : { gridTemplateColumns: '1fr', gridTemplateRows: `minmax(0, 1fr) 8px ${clampH(ribbonH)}px` }
        }
      >
        <RibbonPanel />
        <div
          className={`split-divider ${vertical ? 'v' : 'h'}`}
          role="separator"
          aria-orientation={vertical ? 'vertical' : 'horizontal'}
          aria-label="Resize the histomap panel (drag; double-click to reset)"
          title="Drag to resize · double-click to reset"
          onPointerDown={(e) => {
            dragging.current = true
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={onDividerMove}
          onPointerUp={() => {
            dragging.current = false
          }}
          onDoubleClick={() => {
            setRibbonW(DEFAULT_RIBBON_W)
            setRibbonH(DEFAULT_RIBBON_H)
            try {
              localStorage.removeItem('histomap-ribbon-w')
              localStorage.removeItem('histomap-ribbon-h')
            } catch { /* private mode */ }
          }}
        >
          <span className="divider-grip" />
        </div>
        <div className="map-wrap">
          <MapView />
          <InfoPanel />
        </div>
      </div>
      <AboutModal />
      <Tooltip />
    </div>
  )
}
