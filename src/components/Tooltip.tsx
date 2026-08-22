import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { formatArea, formatShare } from '../lib/format'

export default function Tooltip() {
  const ref = useRef<HTMLDivElement>(null)
  const hoveredId = useStore((s) => s.hoveredId)
  const entities = useStore((s) => s.entities)
  const timeline = useStore((s) => s.timeline)
  const yearIndex = useStore((s) => s.yearIndex)
  const currentFeatures = useStore((s) => s.currentFeatures)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const move = (e: PointerEvent) => {
      const pad = 14
      const x = Math.min(e.clientX + pad, window.innerWidth - el.offsetWidth - 8)
      const y = Math.min(e.clientY + pad, window.innerHeight - el.offsetHeight - 8)
      el.style.transform = `translate(${x}px, ${y}px)`
    }
    window.addEventListener('pointermove', move)
    return () => window.removeEventListener('pointermove', move)
  }, [hoveredId])

  if (!hoveredId || !entities) return null
  const info = entities[hoveredId]
  if (!info) return null
  const feature = currentFeatures?.get(hoveredId)
  const share =
    feature && info.k === 's' && timeline && timeline.stateArea[yearIndex] > 0
      ? feature.a / timeline.stateArea[yearIndex]
      : null

  return (
    <div className="tooltip" ref={ref}>
      <span className="swatch" style={{ background: info.c }} />
      <strong>{info.n}</strong>
      {info.k === 'c' && <em> — cultural area</em>}
      {info.k === 'u' && <em> — unclaimed</em>}
      {feature && info.k === 's' && (
        <div className="tooltip-sub">
          {formatArea(feature.a)}
          {share !== null && ` · ${formatShare(share)}`}
        </div>
      )}
    </div>
  )
}
