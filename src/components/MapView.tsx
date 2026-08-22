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
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': OCEAN } }],
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
      .then((fc) => {
        if (cancelled || !mapRef.current) return
        ;(map.getSource('polities') as GeoJSONSource).setData(fc)
        const byId = new Map<string, YearFeatureProps>()
        for (const f of fc.features) {
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

  return (
    <div className="map-view" ref={containerRef}>
      {year !== undefined && (
        <div className="year-readout" aria-live="polite">
          <span className="year-label">{formatYear(year)}</span>
          {year < 1650 && <span className="precision-chip">borders approximate</span>}
        </div>
      )}
    </div>
  )
}
