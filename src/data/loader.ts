import { feature } from 'topojson-client'
import type { FeatureCollection } from 'geojson'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { Timeline } from '../types'

const cache = new Map<number, Promise<FeatureCollection>>()

export function loadYear(timeline: Timeline, yearIndex: number): Promise<FeatureCollection> {
  let promise = cache.get(yearIndex)
  if (!promise) {
    const year = timeline.years[yearIndex]
    promise = fetch(`${import.meta.env.BASE_URL}data/years/${year}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load year ${year}: HTTP ${res.status}`)
        return res.json() as Promise<Topology<{ world: GeometryCollection }>>
      })
      .then((topo) => feature(topo, topo.objects.world) as FeatureCollection)
    cache.set(yearIndex, promise)
    promise.catch(() => cache.delete(yearIndex))
  }
  return promise
}

/** warm the cache around the current snapshot; further ahead while playing */
export function prefetchAround(timeline: Timeline, yearIndex: number, playing: boolean): void {
  const offsets = playing ? [1, 2, 3] : [-1, 1]
  for (const d of offsets) {
    const i = yearIndex + d
    if (i >= 0 && i < timeline.years.length) loadYear(timeline, i).catch(() => {})
  }
}
