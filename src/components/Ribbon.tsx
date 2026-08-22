import { useEffect, useMemo, useRef, useState } from 'react'
import { area, curveMonotoneX, curveMonotoneY } from 'd3-shape'
import { scaleLinear, scalePoint } from 'd3-scale'
import { useStore } from '../store'
import { formatYear } from '../lib/format'

export type Orientation = 'vertical' | 'horizontal'

interface StackedPoint {
  a0: number
  a1: number
}
interface Layer {
  id: string
  color: string
  label: string
  points: StackedPoint[] // share-of-state-land offsets in [0,1] per snapshot
  maxIdx: number
  maxShare: number
}

const luminance = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16)
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
}

const TICK_YEARS = [-2000, -1500, -1000, -500, -1, 500, 1000, 1500, 2010]

export default function Ribbon({ orientation }: { orientation: Orientation }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: 0, h: 0 })
  const timeline = useStore((s) => s.timeline)
  const entities = useStore((s) => s.entities)
  const yearIndex = useStore((s) => s.yearIndex)
  const hoveredId = useStore((s) => s.hoveredId)
  const selectedId = useStore((s) => s.selectedId)
  const timeScaleMode = useStore((s) => s.timeScaleMode)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setDims({ w: Math.round(width), h: Math.round(height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const layers = useMemo<Layer[]>(() => {
    if (!timeline || !entities) return []
    return timeline.streams.map((id) => {
      const values = timeline.series[id]
      const points: StackedPoint[] = []
      let maxIdx = 0
      let maxShare = 0
      for (let i = 0; i < timeline.years.length; i++) {
        const share = timeline.stateArea[i] > 0 ? values[i] / timeline.stateArea[i] : 0
        points.push({ a0: 0, a1: share })
        if (share > maxShare) {
          maxShare = share
          maxIdx = i
        }
      }
      const info = entities[id]
      return { id, color: info?.c ?? '#b9a88a', label: info?.n ?? id, points, maxIdx, maxShare }
    })
  }, [timeline, entities])

  // cumulative stacking (shares per column already sum to 1)
  const stacked = useMemo(() => {
    if (!timeline) return layers
    const acc = new Array(timeline.years.length).fill(0)
    return layers.map((layer) => ({
      ...layer,
      points: layer.points.map((p, i) => {
        const a0 = acc[i]
        acc[i] += p.a1
        return { a0, a1: acc[i] }
      }),
    }))
  }, [layers, timeline])

  const vertical = orientation === 'vertical'
  const gutter = vertical ? 44 : 30 // axis labels along the time edge
  const padTime = 6
  const timeExtent = vertical ? dims.h : dims.w
  const breadthExtent = (vertical ? dims.w : dims.h) - gutter

  const pos = useMemo(() => {
    if (!timeline) return () => 0
    const range: [number, number] = [padTime, Math.max(padTime + 1, timeExtent - padTime)]
    if (timeScaleMode === 'linear') {
      const s = scaleLinear()
        .domain([timeline.years[0], timeline.years[timeline.years.length - 1]])
        .range(range)
      return (i: number) => s(timeline.years[i])
    }
    const s = scalePoint<number>()
      .domain(timeline.years.map((_, i) => i))
      .range(range)
    return (i: number) => s(i) ?? 0
  }, [timeline, timeScaleMode, timeExtent])

  const breadth = (v: number) => gutter + v * Math.max(0, breadthExtent)

  const pathFor = useMemo(() => {
    if (vertical) {
      return area<StackedPoint>()
        .y((_, i) => pos(i))
        .x0((d) => breadth(d.a0))
        .x1((d) => breadth(d.a1))
        .curve(curveMonotoneY)
    }
    return area<StackedPoint>()
      .x((_, i) => pos(i))
      .y0((d) => breadth(d.a0))
      .y1((d) => breadth(d.a1))
      .curve(curveMonotoneX)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vertical, pos, breadthExtent, gutter])

  // scrub interaction: drag anywhere sets the year; a click also selects the band
  const drag = useRef<{ start: [number, number]; moved: boolean } | null>(null)
  const posToIndex = (x: number, y: number): number => {
    if (!timeline) return 0
    const t = vertical ? y : x
    let best = 0
    let bestDist = Infinity
    for (let i = 0; i < timeline.years.length; i++) {
      const d = Math.abs(pos(i) - t)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    }
    return best
  }
  const localPoint = (e: React.PointerEvent<SVGSVGElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect()
    return [e.clientX - rect.left, e.clientY - rect.top]
  }

  if (!timeline || dims.w < 40 || dims.h < 40)
    return <div className="ribbon-wrap" ref={wrapRef} />

  const playheadPos = pos(yearIndex)
  const activeId = hoveredId ?? selectedId

  return (
    <div className="ribbon-wrap" ref={wrapRef}>
      <svg
        className="ribbon"
        width={dims.w}
        height={dims.h}
        data-has-selection={selectedId ? '' : undefined}
        role="img"
        aria-label="Histomap ribbon: share of state-held land per civilization over time"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          const p = localPoint(e)
          drag.current = { start: p, moved: false }
          useStore.getState().setYearIndex(posToIndex(...p))
          useStore.getState().setPlaying(false)
        }}
        onPointerMove={(e) => {
          if (!drag.current) {
            const el = (e.target as SVGElement).closest('[data-id]')
            useStore.getState().setHovered(el?.getAttribute('data-id') ?? null)
            return
          }
          const p = localPoint(e)
          if (Math.hypot(p[0] - drag.current.start[0], p[1] - drag.current.start[1]) > 4)
            drag.current.moved = true
          useStore.getState().setYearIndex(posToIndex(...p))
        }}
        onPointerUp={(e) => {
          const wasDrag = drag.current?.moved
          drag.current = null
          if (!wasDrag) {
            const el = (e.target as SVGElement).closest('[data-id]')
            const id = el?.getAttribute('data-id') ?? null
            const { selectedId: current, setSelected } = useStore.getState()
            if (id) setSelected(id === current ? null : id)
          }
        }}
        onPointerLeave={() => useStore.getState().setHovered(null)}
      >
        {/* century gridlines + snapshot ticks along the time edge */}
        <g className="ribbon-axis">
          {TICK_YEARS.map((year) => {
            const i = timeline.years.indexOf(year)
            const t =
              timeScaleMode === 'linear' || i < 0
                ? scaleLinear()
                    .domain([timeline.years[0], timeline.years[timeline.years.length - 1]])
                    .range([padTime, timeExtent - padTime])(year)
                : pos(i)
            if (timeScaleMode === 'snapshot' && i < 0) return null
            return vertical ? (
              <g key={year}>
                <line x1={gutter - 4} x2={dims.w} y1={t} y2={t} className="tick-line" />
                <text x={gutter - 8} y={t} dy="0.32em" textAnchor="end" className="tick-text">
                  {formatYear(year)}
                </text>
              </g>
            ) : (
              <g key={year}>
                <line y1={gutter - 4} y2={dims.h} x1={t} x2={t} className="tick-line" />
                <text y={gutter - 8} x={t} textAnchor="middle" className="tick-text">
                  {formatYear(year)}
                </text>
              </g>
            )
          })}
          {timeline.years.map((_, i) => {
            const t = pos(i)
            return vertical ? (
              <line key={i} x1={gutter - 4} x2={gutter} y1={t} y2={t} className="snapshot-tick" />
            ) : (
              <line key={i} y1={gutter - 4} y2={gutter} x1={t} x2={t} className="snapshot-tick" />
            )
          })}
        </g>

        <g>
          {stacked.map((layer) => {
            const d = pathFor(layer.points) ?? ''
            const cls =
              layer.id === selectedId ? 'stream selected' : layer.id === activeId ? 'stream active' : 'stream'
            return <path key={layer.id} d={d} fill={layer.color} className={cls} data-id={layer.id} />
          })}
        </g>

        {/* in-stream labels at each stream's widest moment */}
        <g className="stream-labels">
          {stacked.map((layer) => {
            const px = layer.maxShare * breadthExtent
            if (px < 14) return null
            const mid = breadth((layer.points[layer.maxIdx].a0 + layer.points[layer.maxIdx].a1) / 2)
            const t = pos(layer.maxIdx)
            const fill = luminance(layer.color) > 0.62 ? '#3a3226' : '#f7f1e0'
            const fontSize = Math.max(9, Math.min(13, px * 0.4))
            return (
              <text
                key={layer.id}
                x={vertical ? mid : t}
                y={vertical ? t : mid}
                dy="0.32em"
                textAnchor="middle"
                fill={fill}
                fontSize={fontSize}
                className="stream-label"
                data-id={layer.id}
              >
                {layer.label}
              </text>
            )
          })}
        </g>

        {/* playhead */}
        {vertical ? (
          <g className="playhead" transform={`translate(0 ${playheadPos})`}>
            <line x1={gutter - 4} x2={dims.w} y1={0} y2={0} />
            <circle cx={gutter - 4} cy={0} r={3} />
          </g>
        ) : (
          <g className="playhead" transform={`translate(${playheadPos} 0)`}>
            <line y1={gutter - 4} y2={dims.h} x1={0} x2={0} />
            <circle cy={gutter - 4} cx={0} r={3} />
          </g>
        )}
      </svg>
    </div>
  )
}
