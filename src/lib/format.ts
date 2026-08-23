import type { EntityInfo } from '../types'

export const formatYear = (year: number): string => {
  if (year <= -10000) return `${(-year).toLocaleString('en-US')} BC`
  if (year < 0) return `${-year} BC`
  if (year < 1000) return `AD ${year}`
  return String(year)
}

const numberFormat = new Intl.NumberFormat('en-US')

export const formatArea = (km2: number): string => `${numberFormat.format(Math.round(km2))} km²`

export const formatShare = (fraction: number): string =>
  fraction >= 0.1 ? `${(fraction * 100).toFixed(0)}%` : `${(fraction * 100).toFixed(1)}%`

export const precisionLabel = (p: number): string =>
  p >= 3 ? 'treaty-defined' : p === 2 ? 'moderate' : 'approximate'

export const wikipediaUrl = (info: EntityInfo): string =>
  info.w
    ? `https://en.wikipedia.org/wiki/${encodeURIComponent(info.w.replace(/ /g, '_'))}`
    : `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(info.n)}`
