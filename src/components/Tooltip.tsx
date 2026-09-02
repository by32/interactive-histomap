import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { formatArea, formatShare, formatYear } from '../lib/format'

// Last known pointer position, tracked even while no tooltip is mounted: on touch
// devices the note mounts on the tap's click, after the pointerdown has already
// happened, and must appear at the tap point rather than the viewport corner.
const lastPointer = { x: 0, y: 0 }

export default function Tooltip() {
  const ref = useRef<HTMLDivElement>(null)
  const hoveredId = useStore((s) => s.hoveredId)
  const hoveredCity = useStore((s) => s.hoveredCity)
  const hoveredEvent = useStore((s) => s.hoveredEvent)
  const entities = useStore((s) => s.entities)
  const timeline = useStore((s) => s.timeline)
  const yearIndex = useStore((s) => s.yearIndex)
  const currentFeatures = useStore((s) => s.currentFeatures)

  useEffect(() => {
    const track = (e: PointerEvent) => {
      lastPointer.x = e.clientX
      lastPointer.y = e.clientY
    }
    window.addEventListener('pointermove', track)
    window.addEventListener('pointerdown', track)
    return () => {
      window.removeEventListener('pointermove', track)
      window.removeEventListener('pointerdown', track)
    }
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const place = () => {
      const pad = 14
      const x = Math.min(lastPointer.x + pad, window.innerWidth - el.offsetWidth - 8)
      const y = Math.min(lastPointer.y + pad, window.innerHeight - el.offsetHeight - 8)
      el.style.transform = `translate(${x}px, ${y}px)`
    }
    const move = (e: PointerEvent) => {
      lastPointer.x = e.clientX
      lastPointer.y = e.clientY
      place()
    }
    place() // position immediately; a tap produces no further pointer events
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerdown', move)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', move)
    }
  }, [hoveredId, hoveredCity, hoveredEvent])

  if (hoveredEvent) {
    return (
      <div className="tooltip" ref={ref}>
        <strong>
          {hoveredEvent.k === 'battle' && '⚔ '}
          {formatYear(hoveredEvent.y)}
        </strong>
        <div className="tooltip-sub">{hoveredEvent.t}</div>
      </div>
    )
  }
  if (hoveredCity) {
    return (
      <div className="tooltip" ref={ref}>
        <strong>{hoveredCity.n}</strong>
        <div className="tooltip-sub">
          inhabited from {formatYear(hoveredCity.f)}
          {hoveredCity.t !== undefined && ` to ${formatYear(hoveredCity.t)}`}
          {hoveredCity.w && ' · click for Wikipedia'}
        </div>
      </div>
    )
  }
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
