import Ribbon from './Ribbon'
import TimeControls from './TimeControls'
import { useOrientation } from '../lib/useOrientation'

export default function RibbonPanel() {
  const orientation = useOrientation()

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
