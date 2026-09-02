import { useEffect, useMemo, useRef, useState } from 'react'
import { area, line, curveMonotoneX, curveMonotoneY } from 'd3-shape'
import { scaleLinear, scalePoint } from 'd3-scale'
import { useStore } from '../store'
import { formatYear } from '../lib/format'
import events from '../data/events.json'

export type Orientation = 'vertical' | 'horizontal'

interface HistoricalEvent {
  y: number
  t: string
  e?: string
  k?: string
  c?: [number, number]
}
const EVENTS = events as HistoricalEvent[]

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

const TICK_YEARS = [-10000, -8000, -4000, -3000, -2000, -1500, -1000, -500, -1, 500, 1000, 1500, 2010]

// In linear mode, deep time (10,000-4000 BC) is compressed into a small
// leading segment behind a marked axis break, so recorded history keeps the
// original Histomap's proportions.
const DEEP_END = -4000
const DEEP_FRACTION = 0.09

const CHAR_W = 0.55 // rough serif advance per px of font size
const MIN_FONT = 8.5
const MAX_FONT = 12.5
const MIN_BAND_PX = 11

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}
const intersects = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

interface PlacedLabel {
  id: string
  text: string
  x: number
  y: number
  fontSize: number
  fill: string
  halo: string
}

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
      return { id, color: info?.c ?? '#b9a88a', label: info?.s ?? info?.n ?? id, points, maxIdx, maxShare }
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
  const gutter = vertical ? 62 : 30 // axis labels along the time edge
  const padTime = 6
  const timeExtent = vertical ? dims.h : dims.w
  const breadthExtent = (vertical ? dims.w : dims.h) - gutter

  const hasDeepTime = (timeline?.years[0] ?? 0) < DEEP_END

  const linearPos = useMemo(() => {
    if (!timeline) return () => 0
    const first = timeline.years[0]
    const last = timeline.years[timeline.years.length - 1]
    const r0 = padTime
    const r1 = Math.max(padTime + 1, timeExtent - padTime)
    if (first >= DEEP_END) {
      const s = scaleLinear().domain([first, last]).range([r0, r1])
      return (y: number) => s(y)
    }
    const breakAt = r0 + (r1 - r0) * DEEP_FRACTION
    const deep = scaleLinear().domain([first, DEEP_END]).range([r0, breakAt])
    const main = scaleLinear().domain([DEEP_END, last]).range([breakAt, r1])
    return (y: number) => (y <= DEEP_END ? deep(y) : main(y))
  }, [timeline, timeExtent])

  const pos = useMemo(() => {
    if (!timeline) return () => 0
    if (timeScaleMode === 'linear') return (i: number) => linearPos(timeline.years[i])
    const s = scalePoint<number>()
      .domain(timeline.years.map((_, i) => i))
      .range([padTime, Math.max(padTime + 1, timeExtent - padTime)])
    return (i: number) => s(i) ?? 0
  }, [timeline, timeScaleMode, timeExtent, linearPos])

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

  // collision-aware label placement: biggest streams claim space first, each
  // trying its widest snapshots until a spot fits its band and hits nothing
  const placedLabels = useMemo<PlacedLabel[]>(() => {
    if (!timeline || breadthExtent <= 0 || timeExtent <= 0) return []
    const placed: Box[] = []
    const out: PlacedLabel[] = []
    const byProminence = [...stacked].sort((a, b) => b.maxShare - a.maxShare)
    for (const layer of byProminence) {
      const text = layer.label.replace(/\s*\(.*\)$/, '')
      const candidates = layer.points
        .map((p, i) => ({ i, bandPx: (p.a1 - p.a0) * breadthExtent }))
        .filter((c) => c.bandPx >= MIN_BAND_PX)
        .sort((a, b) => b.bandPx - a.bandPx)
        .slice(0, 12)
      // first insist the label fits inside its band, then allow a haloed spill
      let done = false
      for (const tolerance of [1.25, 2.1]) {
        for (const { i, bandPx } of candidates) {
          let fontSize: number
          if (vertical) {
            fontSize = Math.max(MIN_FONT, Math.min(MAX_FONT, bandPx * 0.5))
            if (text.length * fontSize * CHAR_W > bandPx * tolerance)
              fontSize = (bandPx * tolerance) / (text.length * CHAR_W)
            if (fontSize < MIN_FONT) continue
          } else {
            fontSize = Math.max(MIN_FONT, Math.min(MAX_FONT, bandPx * 0.6))
            if (fontSize > bandPx * 0.9) fontSize = bandPx * 0.9
            if (fontSize < MIN_FONT) continue
          }
          const textW = text.length * fontSize * CHAR_W
          const p = layer.points[i]
          const t = Math.max(12, Math.min(timeExtent - 8, pos(i)))
          let m = breadth((p.a0 + p.a1) / 2)
          const along = vertical ? textW : fontSize // box extent along the breadth axis
          if (along > breadthExtent) continue
          m = Math.max(gutter + 2 + along / 2, Math.min(gutter + breadthExtent - 2 - along / 2, m))
          const box: Box = vertical
            ? { x0: m - textW / 2 - 3, x1: m + textW / 2 + 3, y0: t - fontSize / 2 - 2, y1: t + fontSize / 2 + 2 }
            : { x0: t - textW / 2 - 3, x1: t + textW / 2 + 3, y0: m - fontSize / 2 - 2, y1: m + fontSize / 2 + 2 }
          if (placed.some((b) => intersects(b, box))) continue
          placed.push(box)
          const light = luminance(layer.color) > 0.62
          out.push({
            id: layer.id,
            text,
            x: vertical ? m : t,
            y: vertical ? t : m,
            fontSize,
            fill: light ? '#3a3226' : '#f7f1e0',
            halo: light ? 'rgba(244,236,217,0.55)' : 'rgba(40,32,20,0.45)',
          })
          done = true
          break
        }
        if (done) break
      }
    }
    return out
  }, [stacked, timeline, vertical, pos, breadthExtent, timeExtent, gutter])

  // family boundaries, echoing the original's grouped bands
  const dividers = useMemo<string[]>(() => {
    if (!timeline || !entities) return []
    const boundary = vertical
      ? line<StackedPoint>().y((_, i) => pos(i)).x((d) => breadth(d.a0)).curve(curveMonotoneY)
      : line<StackedPoint>().x((_, i) => pos(i)).y((d) => breadth(d.a0)).curve(curveMonotoneX)
    const paths: string[] = []
    for (let k = 1; k < stacked.length; k++) {
      const fam = entities[stacked[k].id]?.f ?? `#${stacked[k].id}`
      const prev = entities[stacked[k - 1].id]?.f ?? `#${stacked[k - 1].id}`
      if (fam !== prev) paths.push(boundary(stacked[k].points) ?? '')
    }
    return paths
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stacked, entities, timeline, vertical, pos, breadthExtent, gutter])

  // event years fall between snapshots: interpolate their axis position
  const yearToPos = (y: number): number => {
    if (!timeline) return 0
    if (timeScaleMode === 'linear') return linearPos(y)
    const ys = timeline.years
    if (y <= ys[0]) return pos(0)
    if (y >= ys[ys.length - 1]) return pos(ys.length - 1)
    let i = 0
    while (ys[i + 1] < y) i++
    const f = (y - ys[i]) / (ys[i + 1] - ys[i])
    return pos(i) + (pos(i + 1) - pos(i)) * f
  }
  const nearestSnapshot = (y: number): number => {
    if (!timeline) return 0
    let best = 0
    let bestDist = Infinity
    timeline.years.forEach((yr, i) => {
      const d = Math.abs(yr - y)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    })
    return best
  }

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
            const marker = (e.target as SVGElement).closest('[data-event-idx]')
            if (marker) {
              const ev = EVENTS[Number(marker.getAttribute('data-event-idx'))]
              useStore.getState().setHoveredEvent({ y: ev.y, t: ev.t, k: ev.k })
              useStore.getState().setHovered(null)
              return
            }
            useStore.getState().setHoveredEvent(null)
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
          if (wasDrag) return
          const marker = (e.target as SVGElement).closest('[data-event-idx]')
          if (marker) {
            const ev = EVENTS[Number(marker.getAttribute('data-event-idx'))]
            useStore.getState().setYearIndex(nearestSnapshot(ev.y))
            if (ev.e) useStore.getState().setSelected(ev.e)
            // touch devices never hover: surface the note briefly on tap
            if (window.matchMedia('(hover: none)').matches) {
              useStore.getState().setHoveredEvent({ y: ev.y, t: ev.t, k: ev.k })
              window.setTimeout(() => useStore.getState().setHoveredEvent(null), 3000)
            }
            return
          }
          const el = (e.target as SVGElement).closest('[data-id]')
          const id = el?.getAttribute('data-id') ?? null
          const { selectedId: current, setSelected } = useStore.getState()
          if (id) setSelected(id === current ? null : id)
        }}
        onPointerLeave={() => {
          useStore.getState().setHovered(null)
          useStore.getState().setHoveredEvent(null)
        }}
      >
        {/* century gridlines + snapshot ticks along the time edge */}
        <g className="ribbon-axis">
          {TICK_YEARS.map((year) => {
            const i = timeline.years.indexOf(year)
            if (year < timeline.years[0]) return null
            if (timeScaleMode === 'snapshot' && i < 0) return null
            const t = timeScaleMode === 'linear' || i < 0 ? linearPos(year) : pos(i)
            const tt = Math.max(10, Math.min((vertical ? dims.h : dims.w) - 6, t))
            return vertical ? (
              <g key={year}>
                <line x1={gutter - 4} x2={dims.w} y1={t} y2={t} className="tick-line" />
                <text x={gutter - 8} y={tt} dy="0.32em" textAnchor="end" className="tick-text">
                  {formatYear(year)}
                </text>
              </g>
            ) : (
              <g key={year}>
                <line y1={gutter - 4} y2={dims.h} x1={t} x2={t} className="tick-line" />
                <text
                  y={gutter - 8}
                  x={Math.max(28, Math.min(dims.w - 28, t))}
                  textAnchor="middle"
                  className="tick-text"
                >
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
          {timeScaleMode === 'linear' && hasDeepTime && (
            <g className="axis-break">
              {vertical ? (
                <>
                  <line x1={gutter - 16} x2={gutter + 5} y1={linearPos(DEEP_END) + 2} y2={linearPos(DEEP_END) - 4} />
                  <line x1={gutter - 16} x2={gutter + 5} y1={linearPos(DEEP_END) + 7} y2={linearPos(DEEP_END) + 1} />
                </>
              ) : (
                <>
                  <line y1={gutter - 16} y2={gutter + 5} x1={linearPos(DEEP_END) + 2} x2={linearPos(DEEP_END) - 4} />
                  <line y1={gutter - 16} y2={gutter + 5} x1={linearPos(DEEP_END) + 7} x2={linearPos(DEEP_END) + 1} />
                </>
              )}
            </g>
          )}
        </g>

        <g>
          {stacked.map((layer) => {
            const d = pathFor(layer.points) ?? ''
            const cls =
              layer.id === selectedId ? 'stream selected' : layer.id === activeId ? 'stream active' : 'stream'
            return <path key={layer.id} d={d} fill={layer.color} className={cls} data-id={layer.id} />
          })}
        </g>

        <g className="dividers">
          {dividers.map((d, i) => (
            <path key={i} d={d} className="divider" />
          ))}
        </g>

        {(() => {
          const firstStateIdx = timeline.stateArea.findIndex((v) => v > 1_000_000)
          if (firstStateIdx <= 0) return null
          const t0 = pos(0)
          const t1 = pos(firstStateIdx)
          const span = t1 - t0
          if (vertical ? span < 16 : span < 145) return null
          const mid = (t0 + t1) / 2
          const center = gutter + breadthExtent / 2
          return (
            <text
              className="prehistory-caption"
              x={vertical ? center : mid}
              y={vertical ? mid : center}
              dy="0.32em"
              textAnchor="middle"
            >
              foragers &amp; first farmers
            </text>
          )
        })()}

        {/* collision-free in-stream labels */}
        <g className="stream-labels">
          {placedLabels.map((label) => (
            <text
              key={label.id}
              x={label.x}
              y={label.y}
              dy="0.32em"
              textAnchor="middle"
              fill={label.fill}
              stroke={label.halo}
              fontSize={label.fontSize}
              className={label.id === selectedId ? 'stream-label selected-label' : 'stream-label'}
              data-id={label.id}
            >
              {label.text}
            </text>
          ))}
        </g>

        {/* margin notes: curated events along the outer edge */}
        <g className="event-markers">
          {EVENTS.map((ev, idx) => {
            if (!timeline || ev.y < timeline.years[0]) return null
            const t = yearToPos(ev.y)
            return (
              <circle
                key={idx}
                className={ev.k === 'battle' ? 'event-dot battle' : 'event-dot'}
                cx={vertical ? dims.w - 7 : t}
                cy={vertical ? t : dims.h - 7}
                r={3}
                data-event-idx={idx}
              />
            )
          })}
        </g>

        {/* time slider: a track along the axis with a grabbable thumb at the playhead */}
        {(() => {
          const sliderAria = {
            role: 'slider' as const,
            'aria-label': 'Year',
            'aria-valuemin': timeline.years[0],
            'aria-valuemax': timeline.years[timeline.years.length - 1],
            'aria-valuenow': timeline.years[yearIndex],
            'aria-valuetext': formatYear(timeline.years[yearIndex]),
          }
          return vertical ? (
            <g className="playhead">
              <line
                className="slider-track"
                x1={gutter - 4}
                x2={gutter - 4}
                y1={pos(0)}
                y2={pos(timeline.years.length - 1)}
              />
              <line x1={gutter - 4} x2={dims.w} y1={playheadPos} y2={playheadPos} />
              <g className="slider-thumb" transform={`translate(${gutter - 4} ${playheadPos})`} {...sliderAria}>
                <circle className="thumb-outer" r={8} />
                <circle className="thumb-inner" r={3.2} />
              </g>
            </g>
          ) : (
            <g className="playhead">
              <line
                className="slider-track"
                y1={gutter - 4}
                y2={gutter - 4}
                x1={pos(0)}
                x2={pos(timeline.years.length - 1)}
              />
              <line y1={gutter - 4} y2={dims.h} x1={playheadPos} x2={playheadPos} />
              <g className="slider-thumb" transform={`translate(${playheadPos} ${gutter - 4})`} {...sliderAria}>
                <circle className="thumb-outer" r={8} />
                <circle className="thumb-inner" r={3.2} />
              </g>
            </g>
          )
        })()}
      </svg>
    </div>
  )
}
