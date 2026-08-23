import { useStore } from '../store'
import { formatArea, formatShare, formatYear, precisionLabel, wikipediaUrl } from '../lib/format'

function Sparkline({ id }: { id: string }) {
  const timeline = useStore((s) => s.timeline)
  const yearIndex = useStore((s) => s.yearIndex)
  const setYearIndex = useStore((s) => s.setYearIndex)
  const entities = useStore((s) => s.entities)
  const series = timeline?.series[id]
  if (!timeline || !series) return null
  const max = Math.max(...series)
  if (max <= 0) return null
  const W = 232
  const H = 44
  const n = series.length
  const x = (i: number) => (i / (n - 1)) * W
  const yOf = (v: number) => H - 3 - (v / max) * (H - 8)
  const path =
    `M0,${H} ` + series.map((v, i) => `L${x(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ') + ` L${W},${H} Z`
  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Territorial extent across all snapshots — click to jump in time"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const i = Math.round(((e.clientX - rect.left) / rect.width) * (n - 1))
        setYearIndex(i)
      }}
    >
      <path d={path} fill={entities?.[id]?.c ?? '#b9a88a'} opacity={0.65} />
      <line
        x1={x(yearIndex)}
        x2={x(yearIndex)}
        y1={2}
        y2={H}
        stroke="var(--ink)"
        strokeWidth={1.2}
        strokeDasharray="3 2"
      />
    </svg>
  )
}

export default function InfoPanel() {
  const selectedId = useStore((s) => s.selectedId)
  const entities = useStore((s) => s.entities)
  const timeline = useStore((s) => s.timeline)
  const yearIndex = useStore((s) => s.yearIndex)
  const currentFeatures = useStore((s) => s.currentFeatures)
  const setSelected = useStore((s) => s.setSelected)
  const focusOn = useStore((s) => s.focusOn)
  const setFocusOn = useStore((s) => s.setFocusOn)

  if (!selectedId || !entities || !timeline) return null
  const info = entities[selectedId]
  if (!info) return null

  const family = info.f ? timeline.families.find((f) => f.id === info.f) : undefined
  const feature = currentFeatures?.get(selectedId)
  const share =
    feature && info.k === 's' && timeline.stateArea[yearIndex] > 0
      ? feature.a / timeline.stateArea[yearIndex]
      : null
  const present = info.present
  const span = present.length
    ? `${formatYear(timeline.years[present[0]])} – ${formatYear(timeline.years[present[present.length - 1]])}`
    : null

  return (
    <section className="info-panel" aria-label={`Details for ${info.n}`}>
      <button className="close-btn" onClick={() => setSelected(null)} aria-label="Close details">
        ×
      </button>
      <h2 style={{ borderLeft: `5px solid ${info.c}` }}>{info.n}</h2>
      <dl>
        {family && (
          <>
            <dt>Family</dt>
            <dd>
              <span className="swatch" style={{ background: family.color }} />
              {family.label}
            </dd>
          </>
        )}
        {info.k === 'c' && (
          <>
            <dt>Type</dt>
            <dd>Cultural / tribal area — shown on the map but not counted in the ribbon</dd>
          </>
        )}
        {feature ? (
          <>
            <dt>In {formatYear(timeline.years[yearIndex])}</dt>
            <dd>
              {formatArea(feature.a)}
              {share !== null && <> · {formatShare(share)} of state-held land</>}
            </dd>
            <dt>Border precision</dt>
            <dd>{precisionLabel(feature.p)}</dd>
          </>
        ) : (
          <>
            <dt>In {formatYear(timeline.years[yearIndex])}</dt>
            <dd>not on the map this year</dd>
          </>
        )}
        {span && (
          <>
            <dt>Appears</dt>
            <dd>
              {span} ({present.length} of {timeline.years.length} snapshots)
            </dd>
          </>
        )}
        <dt>Peak extent</dt>
        <dd>{formatArea(info.peak)}</dd>
      </dl>
      <Sparkline id={selectedId} />
      <div className="info-actions">
        <button
          className={`focus-btn${focusOn ? ' on' : ''}`}
          onClick={() => setFocusOn(!focusOn)}
          title="Trace this polity's footprint across every era it existed"
        >
          {focusOn ? '✦ exit focus' : '✦ focus'}
        </button>
        <a className="wiki-link" href={wikipediaUrl(info)} target="_blank" rel="noreferrer">
          Read on Wikipedia ↗
        </a>
      </div>
    </section>
  )
}
