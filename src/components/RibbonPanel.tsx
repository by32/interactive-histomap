import { useEffect, useState } from 'react'
import Ribbon, { type Orientation } from './Ribbon'
import TimeControls from './TimeControls'

const QUERY = '(max-width: 900px)'

export default function RibbonPanel() {
  const [orientation, setOrientation] = useState<Orientation>(() =>
    window.matchMedia(QUERY).matches ? 'horizontal' : 'vertical',
  )
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = () => setOrientation(mq.matches ? 'horizontal' : 'vertical')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return (
    <aside className="ribbon-panel" aria-label="Histomap timeline">
      <div className="ribbon-head">
        <span className="ribbon-title">Share of state-held land</span>
        <TimeControls />
      </div>
      <Ribbon orientation={orientation} />
    </aside>
  )
}
