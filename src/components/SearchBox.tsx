import { useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { formatYear } from '../lib/format'

interface Match {
  id: string
  name: string
  color: string
  kind: string
  peak: number
}

export default function SearchBox() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const entities = useStore((s) => s.entities)
  const timeline = useStore((s) => s.timeline)

  const matches = useMemo<Match[]>(() => {
    if (!entities || query.trim().length < 2) return []
    const q = query.trim().toLowerCase()
    return Object.entries(entities)
      .filter(([, info]) => info.n.toLowerCase().includes(q))
      .map(([id, info]) => ({ id, name: info.n, color: info.c, kind: info.k, peak: info.peak }))
      .sort((a, b) => (a.kind === b.kind ? b.peak - a.peak : a.kind === 's' ? -1 : 1))
      .slice(0, 8)
  }, [entities, query])

  const choose = (id: string) => {
    const { timeline, entities, setSelected, setYearIndex, setPlaying } = useStore.getState()
    if (!timeline || !entities) return
    setPlaying(false)
    setSelected(id)
    // jump to the entity's peak snapshot (streams) or the middle of its presence
    const series = timeline.series[id]
    let target: number | undefined
    if (series) {
      let best = -1
      series.forEach((v, i) => {
        if (v > (series[best] ?? -1)) best = i
      })
      if (best >= 0 && series[best] > 0) target = best
    } else {
      const present = entities[id]?.present
      if (present?.length) target = present[Math.floor(present.length / 2)]
    }
    if (target !== undefined) setYearIndex(target)
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  return (
    <div className="search-box">
      <input
        ref={inputRef}
        type="search"
        placeholder="Find an empire…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches[0]) choose(matches[0].id)
          if (e.key === 'Escape') {
            setQuery('')
            setOpen(false)
          }
        }}
        aria-label="Search entities"
      />
      {open && matches.length > 0 && (
        <ul className="search-results" role="listbox">
          {matches.map((m) => (
            <li key={m.id}>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => choose(m.id)}>
                <span className="swatch" style={{ background: m.color }} />
                <span className="name">{m.name}</span>
                {m.kind !== 's' && <span className="kind-hint">cultural area</span>}
                {m.kind === 's' && timeline && (
                  <span className="kind-hint">
                    {(() => {
                      const present = useStore.getState().entities?.[m.id]?.present
                      return present?.length
                        ? `${formatYear(timeline.years[present[0]])} – ${formatYear(timeline.years[present[present.length - 1]])}`
                        : ''
                    })()}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
