import { useEffect, useState } from 'react'
import { useStore } from './store'
import type { EntityIndex, Timeline } from './types'
import Header from './components/Header'
import MapView from './components/MapView'
import RibbonPanel from './components/RibbonPanel'
import InfoPanel from './components/InfoPanel'
import AboutModal from './components/AboutModal'
import Tooltip from './components/Tooltip'
import { initUrlState, syncUrlState } from './lib/urlState'

export default function App() {
  const [error, setError] = useState<string | null>(null)
  const loaded = useStore((s) => s.timeline !== null)

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
      <div className="main">
        <RibbonPanel />
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
