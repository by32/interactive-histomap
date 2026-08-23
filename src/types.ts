export interface Family {
  id: string
  label: string
  color: string
  order: number
}

export interface Timeline {
  years: number[]
  /** km² of land held by organized polities per snapshot (ribbon denominator) */
  stateArea: number[]
  families: Family[]
  /** stream ids in ribbon stacking order, ending with '_other' */
  streams: string[]
  /** km² per stream per snapshot, aligned with `years` */
  series: Record<string, number[]>
}

export type EntityKind = 's' | 'c' | 'u' // state | culture/zone | unclaimed

export interface EntityInfo {
  n: string
  /** compact display name for tight ribbon labels */
  s?: string
  k: EntityKind
  c: string
  /** family id, curated states only */
  f?: string
  /** Wikipedia article title */
  w?: string
  /** snapshot indices where the entity appears */
  present: number[]
  /** peak area, km² */
  peak: number
}

export type EntityIndex = Record<string, EntityInfo>

/** properties carried by every feature in the per-year TopoJSON files */
export interface YearFeatureProps {
  id: string
  n: string
  c: string
  /** area km² (computed before simplification) */
  a: number
  /** border precision: 1 approximate, 2 moderate, 3 treaty-defined */
  p: number
  k: EntityKind
}

export type TimeScaleMode = 'linear' | 'snapshot'
