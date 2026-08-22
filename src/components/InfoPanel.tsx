import { useStore } from '../store'
import { formatArea, formatShare, formatYear, precisionLabel, wikipediaUrl } from '../lib/format'

export default function InfoPanel() {
  const selectedId = useStore((s) => s.selectedId)
  const entities = useStore((s) => s.entities)
  const timeline = useStore((s) => s.timeline)
  const yearIndex = useStore((s) => s.yearIndex)
  const currentFeatures = useStore((s) => s.currentFeatures)
  const setSelected = useStore((s) => s.setSelected)

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
      <a className="wiki-link" href={wikipediaUrl(info)} target="_blank" rel="noreferrer">
        Read on Wikipedia ↗
      </a>
    </section>
  )
}
