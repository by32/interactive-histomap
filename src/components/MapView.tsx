import { useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, NavigationControl, AttributionControl, setWorkerUrl } from 'maplibre-gl'
import type {
  GeoJSONSource,
  MapLayerMouseEvent,
  MapMouseEvent,
  StyleSpecification,
} from 'maplibre-gl'
import type { FeatureCollection, Feature } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useStore } from '../store'
import { loadYear, prefetchAround } from '../data/loader'
import { formatYear } from '../lib/format'
import type { YearFeatureProps } from '../types'

// the worker files are served by the maplibre-worker-assets plugin (vite.config.ts)
setWorkerUrl(`${import.meta.env.BASE_URL}maplibre-worker/maplibre-gl-worker.mjs`)

const OCEAN = '#ccc5b2'
const INK = '#3a3226'

function graticule(): FeatureCollection {
  const features: Feature[] = []
  for (let lon = -180; lon <= 180; lon += 10) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [[lon, -85], [lon, 85]] },
    })
  }
  for (let lat = -80; lat <= 80; lat += 10) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [[-180, lat], [180, lat]] },
    })
  }
  return { type: 'FeatureCollection', features }
}

const BLANK_STYLE: StyleSpecification = {
  version: 8,
  glyphs: `${location.origin}${import.meta.env.BASE_URL}fonts/{fontstack}/{range}.pbf`,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': OCEAN } }],
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

interface Place {
  n: string
  x: number
  y: number
  f: number
  t?: number
  w?: string
}

const bboxOf = (fc: FeatureCollection): [[number, number], [number, number]] | null => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const walk = (c: unknown): void => {
    if (typeof (c as number[])[0] === 'number') {
      const [x, y] = c as [number, number]
      x0 = Math.min(x0, x); x1 = Math.max(x1, x)
      y0 = Math.min(y0, y); y1 = Math.max(y1, y)
    } else for (const child of c as unknown[]) walk(child)
  }
  for (const f of fc.features) if (f.geometry && 'coordinates' in f.geometry) walk(f.geometry.coordinates)
  return x0 === Infinity ? null : [[x0, y0], [x1, y1]]
}

const fillOpacity = (selectedId: string | null): unknown =>
  selectedId
    ? [
        'case',
        ['==', ['get', 'id'], selectedId], 0.96,
        ['boolean', ['feature-state', 'hover'], false], 0.9,
        0.38,
      ]
    : [
        'case',
        ['boolean', ['feature-state', 'hover'], false], 1,
        ['==', ['get', 'k'], 's'], 0.92,
        0.85,
      ]

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const hoveredRef = useRef<string | null>(null)
  const [ready, setReady] = useState(false)
  const timeline = useStore((s) => s.timeline)
  const yearIndex = useStore((s) => s.yearIndex)
  const playing = useStore((s) => s.playing)
  const selectedId = useStore((s) => s.selectedId)
  const year = timeline?.years[yearIndex]

  useEffect(() => {
    if (!containerRef.current) return
    const map = new MapLibreMap({
      container: containerRef.current,
      style: BLANK_STYLE,
      center: [20, 24],
      zoom: 1.4,
      minZoom: 0.6,
      maxZoom: 7,
      renderWorldCopies: true,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    })
    map.touchZoomRotate.disableRotation()
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(
      new AttributionControl({
        compact: true,
        customAttribution:
          'Borders: <a href="https://github.com/aourednik/historical-basemaps" target="_blank" rel="noreferrer">historical-basemaps</a> © André Ourednik (GPL-3.0)',
      }),
    )

    map.on('load', () => {
      map.addSource('graticule', { type: 'geojson', data: graticule() })
      map.addLayer({
        id: 'graticule',
        type: 'line',
        source: 'graticule',
        paint: { 'line-color': 'rgba(58,50,38,0.09)', 'line-width': 0.6 },
      })
      map.addSource('polities', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        promoteId: 'id',
      })
      map.addLayer({
        id: 'polities-fill',
        type: 'fill',
        source: 'polities',
        paint: {
          'fill-color': ['get', 'c'],
          'fill-opacity': fillOpacity(null) as never,
        },
      })
      // Border uncertainty encoding: approximate borders (p=1) render as loose
      // faded dashes, moderate (p=2) as fine dashes, treaty-defined (p=3) solid.
      map.addLayer({
        id: 'outline-approx',
        type: 'line',
        source: 'polities',
        filter: ['all', ['==', ['get', 'k'], 's'], ['==', ['get', 'p'], 1]],
        paint: {
          'line-color': 'rgba(58,50,38,0.34)',
          'line-width': 0.8,
          'line-dasharray': [2.2, 2.6],
        },
      })
      map.addLayer({
        id: 'outline-moderate',
        type: 'line',
        source: 'polities',
        filter: ['all', ['==', ['get', 'k'], 's'], ['==', ['get', 'p'], 2]],
        paint: {
          'line-color': 'rgba(58,50,38,0.42)',
          'line-width': 0.7,
          'line-dasharray': [1.2, 1.4],
        },
      })
      map.addLayer({
        id: 'outline-exact',
        type: 'line',
        source: 'polities',
        filter: ['all', ['==', ['get', 'k'], 's'], ['==', ['get', 'p'], 3]],
        paint: { 'line-color': 'rgba(58,50,38,0.5)', 'line-width': 0.7 },
      })
      map.addLayer({
        id: 'polities-selected',
        type: 'line',
        source: 'polities',
        filter: ['==', ['get', 'id'], ''],
        paint: { 'line-color': INK, 'line-width': 2.2 },
      })
      // empire-focus ghost trace: the selected polity's extent in every era
      map.addSource('focus-ghost', { type: 'geojson', data: EMPTY })
      map.addLayer(
        {
          id: 'focus-ghost-fill',
          type: 'fill',
          source: 'focus-ghost',
          paint: { 'fill-color': ['get', 'c'], 'fill-opacity': 0.13 },
        },
        'polities-selected',
      )
      map.addLayer(
        {
          id: 'focus-ghost-line',
          type: 'line',
          source: 'focus-ghost',
          paint: { 'line-color': ['get', 'c'], 'line-width': 0.7, 'line-opacity': 0.55 },
        },
        'polities-selected',
      )
      // polity name labels (interior anchors precomputed by the pipeline)
      map.addSource('polity-labels', { type: 'geojson', data: EMPTY })
      map.addLayer({
        id: 'labels-cultures',
        type: 'symbol',
        source: 'polity-labels',
        filter: ['all', ['==', ['get', 'k'], 'c'], ['>=', ['get', 'a'], 400000]],
        layout: {
          'text-field': ['coalesce', ['get', 's'], ['get', 'n']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['get', 'a'], 400000, 8.5, 6000000, 10.5],
          'text-letter-spacing': 0.06,
          'text-max-width': 7,
        },
        paint: {
          'text-color': 'rgba(96,82,60,0.8)',
          'text-halo-color': 'rgba(244,236,217,0.7)',
          'text-halo-width': 1,
        },
      })
      map.addLayer({
        id: 'labels-states',
        type: 'symbol',
        source: 'polity-labels',
        filter: ['all', ['==', ['get', 'k'], 's'], ['>=', ['get', 'a'], 30000]],
        layout: {
          'text-field': ['coalesce', ['get', 's'], ['get', 'n']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['get', 'a'], 30000, 8.5, 1000000, 11, 8000000, 15],
          'symbol-sort-key': ['*', -1, ['get', 'a']],
          'text-max-width': 7,
        },
        paint: {
          'text-color': INK,
          'text-halo-color': 'rgba(249,243,228,0.85)',
          'text-halo-width': 1.3,
        },
      })
      // historical cities
      map.addSource('cities', { type: 'geojson', data: EMPTY })
      map.addLayer({
        id: 'cities-dot',
        type: 'circle',
        source: 'cities',
        minzoom: 1.1,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1.1, 1.7, 5, 3.4],
          'circle-color': INK,
          'circle-stroke-color': '#f4ecd9',
          'circle-stroke-width': 0.8,
          'circle-opacity': 0.85,
        },
      })
      map.addLayer({
        id: 'cities-label',
        type: 'symbol',
        source: 'cities',
        minzoom: 2.4,
        layout: {
          'text-field': ['get', 'n'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 9.5,
          'text-anchor': 'top',
          'text-offset': [0, 0.35],
          'text-optional': false,
        },
        paint: {
          'text-color': '#4a3f2e',
          'text-halo-color': 'rgba(249,243,228,0.9)',
          'text-halo-width': 1.1,
        },
      })
      map.on('mousemove', 'cities-dot', (e: MapLayerMouseEvent) => {
        const p = e.features?.[0]?.properties as Place | undefined
        if (p) {
          useStore.getState().setHoveredCity({ n: p.n, f: p.f, t: p.t, w: p.w })
          map.getCanvas().style.cursor = 'pointer'
        }
      })
      map.on('mouseleave', 'cities-dot', () => {
        useStore.getState().setHoveredCity(null)
        map.getCanvas().style.cursor = ''
      })

      let raf = 0
      map.on('mousemove', 'polities-fill', (e: MapLayerMouseEvent) => {
        if (raf) return
        raf = requestAnimationFrame(() => {
          raf = 0
          const id = (e.features?.[0]?.properties?.id as string) ?? null
          useStore.getState().setHovered(id)
          map.getCanvas().style.cursor = id ? 'pointer' : ''
        })
      })
      map.on('mouseleave', 'polities-fill', () => {
        useStore.getState().setHovered(null)
        map.getCanvas().style.cursor = ''
      })
      map.on('click', (e: MapMouseEvent) => {
        const cityHits = map.queryRenderedFeatures(e.point, { layers: ['cities-dot'] })
        const city = cityHits[0]?.properties as Place | undefined
        if (city?.w) {
          window.open(
            `https://en.wikipedia.org/wiki/${encodeURIComponent(city.w.replace(/ /g, '_'))}`,
            '_blank',
            'noreferrer',
          )
          return
        }
        const hits = map.queryRenderedFeatures(e.point, { layers: ['polities-fill'] })
        const id = (hits[0]?.properties?.id as string) ?? null
        const { selectedId: current, setSelected } = useStore.getState()
        setSelected(id === current ? null : id)
      })
      setReady(true)
    })

    mapRef.current = map
    if (import.meta.env.DEV) (window as { __map?: unknown }).__map = map
    return () => {
      mapRef.current = null
      map.remove()
    }
  }, [])

  // year -> polygon data
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !timeline) return
    let cancelled = false
    loadYear(timeline, yearIndex)
      .then((data) => {
        if (cancelled || !mapRef.current) return
        ;(map.getSource('polities') as GeoJSONSource).setData(data.world)
        ;(map.getSource('polity-labels') as GeoJSONSource).setData(data.labels)
        const byId = new Map<string, YearFeatureProps>()
        for (const f of data.world.features) {
          const props = f.properties as unknown as YearFeatureProps
          byId.set(props.id, props)
        }
        useStore.getState().setCurrentFeatures(byId)
      })
      .catch((err) => console.error(err))
    prefetchAround(timeline, yearIndex, playing)
    return () => {
      cancelled = true
    }
  }, [ready, timeline, yearIndex, playing])

  // hover feature-state, driven by store so ribbon hover lights up the map too
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    return useStore.subscribe((state) => {
      const id = state.hoveredId
      if (id === hoveredRef.current) return
      if (hoveredRef.current)
        map.setFeatureState({ source: 'polities', id: hoveredRef.current }, { hover: false })
      if (id) map.setFeatureState({ source: 'polities', id }, { hover: true })
      hoveredRef.current = id
    })
  }, [ready])

  // selection highlight + dimming
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.setFilter('polities-selected', ['==', ['get', 'id'], selectedId ?? ''])
    map.setPaintProperty('polities-fill', 'fill-opacity', fillOpacity(selectedId) as never)
  }, [ready, selectedId])

  // historical cities visible at the current year
  const placesRef = useRef<Place[] | null>(null)
  const [placesLoaded, setPlacesLoaded] = useState(false)
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/places.json`)
      .then((r) => r.json())
      .then((places: Place[]) => {
        placesRef.current = places
        setPlacesLoaded(true)
      })
      .catch(() => {})
  }, [])
  const showCities = useStore((s) => s.showCities)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !placesLoaded || year === undefined) return
    const features = (placesRef.current ?? [])
      .filter((p) => year >= p.f && (p.t === undefined || year <= p.t))
      .map((p) => ({
        type: 'Feature' as const,
        properties: p,
        geometry: { type: 'Point' as const, coordinates: [p.x, p.y] },
      }))
    ;(map.getSource('cities') as GeoJSONSource).setData({ type: 'FeatureCollection', features })
  }, [ready, placesLoaded, year])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const visibility = showCities ? 'visible' : 'none'
    map.setLayoutProperty('cities-dot', 'visibility', visibility)
    map.setLayoutProperty('cities-label', 'visibility', visibility)
  }, [ready, showCities])

  // empire-focus: load the selected polity's extent from every era it exists
  const focusOn = useStore((s) => s.focusOn)
  const entities = useStore((s) => s.entities)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const source = map.getSource('focus-ghost') as GeoJSONSource | undefined
    if (!focusOn || !selectedId || !timeline || !entities) {
      source?.setData(EMPTY)
      return
    }
    let cancelled = false
    let idxs = entities[selectedId]?.present ?? []
    if (idxs.length > 24) {
      const step = (idxs.length - 1) / 23
      idxs = Array.from({ length: 24 }, (_, i) => idxs[Math.round(i * step)])
    }
    Promise.all(idxs.map((i) => loadYear(timeline, i)))
      .then((years) => {
        if (cancelled || !mapRef.current) return
        const features = years.flatMap((d) =>
          d.world.features.filter((f) => (f.properties as { id?: string }).id === selectedId),
        )
        const fc: FeatureCollection = { type: 'FeatureCollection', features }
        source?.setData(fc)
        const bounds = bboxOf(fc)
        if (bounds) map.fitBounds(bounds, { padding: 70, duration: 900, maxZoom: 4.5 })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [ready, focusOn, selectedId, timeline, entities])

  return (
    <div className="map-view" ref={containerRef}>
      {year !== undefined && (
        <div className="year-readout" aria-live="polite">
          <span className="year-label">{formatYear(year)}</span>
          {year < 1650 && <span className="precision-chip">borders approximate</span>}
        </div>
      )}
      <button
        className={`cities-chip${showCities ? ' on' : ''}`}
        onClick={() => useStore.getState().setShowCities(!showCities)}
        title="Toggle historical cities (dots appear when a city exists; zoom in for names)"
      >
        ◉ cities
      </button>
    </div>
  )
}
