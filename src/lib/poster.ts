// Standalone poster renderer: the full ribbon as one tall SVG, in the spirit
// of the 1931 wall chart — uniform rows per snapshot, in-stream labels, and
// the curated events as margin notes down the right side.
import { area, line, curveMonotoneY } from 'd3-shape'
import type { EntityIndex, Timeline } from '../types'
import { formatYear } from './format'
import events from '../data/events.json'

const W = 1600
const ROW_H = 56
const HEADER_H = 210
const FOOTER_H = 150
const GUTTER = 92
const STREAM_W = 1130
const NOTES_X = GUTTER + STREAM_W + 26
const PARCHMENT = '#f4ecd9'
const INK = '#3a3226'
const INK_SOFT = 'rgba(58,50,38,0.62)'
const SERIF = 'Iowan Old Style, Palatino, Georgia, serif'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const luminance = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16)
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
}

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}
const intersects = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

export function buildPosterSvg(timeline: Timeline, entities: EntityIndex): string {
  const n = timeline.years.length
  const chartH = (n - 1) * ROW_H
  const H = HEADER_H + chartH + FOOTER_H
  const posOf = (i: number) => HEADER_H + i * ROW_H
  const bx = (v: number) => GUTTER + v * STREAM_W

  // stack shares per snapshot
  const layers = timeline.streams.map((id) => {
    const info = entities[id]
    const values = timeline.series[id]
    return {
      id,
      color: info?.c ?? '#b9a88a',
      label: (info?.s ?? info?.n ?? id).replace(/\s*\(.*\)$/, ''),
      shares: values.map((v, i) => (timeline.stateArea[i] > 0 ? v / timeline.stateArea[i] : 0)),
    }
  })
  const acc = new Array(n).fill(0)
  const stacked = layers.map((l) => ({
    ...l,
    points: l.shares.map((s, i) => {
      const a0 = acc[i]
      acc[i] += s
      return { a0, a1: acc[i] }
    }),
  }))

  const pathFor = area<{ a0: number; a1: number }>()
    .y((_, i) => posOf(i))
    .x0((d) => bx(d.a0))
    .x1((d) => bx(d.a1))
    .curve(curveMonotoneY)
  const boundaryFor = line<{ a0: number; a1: number }>()
    .y((_, i) => posOf(i))
    .x((d) => bx(d.a0))
    .curve(curveMonotoneY)

  const parts: string[] = []
  parts.push(
    `<rect width="${W}" height="${H}" fill="${PARCHMENT}"/>`,
    `<text x="${W / 2}" y="86" text-anchor="middle" font-family="${SERIF}" font-size="46" font-weight="600" fill="${INK}">THE INTERACTIVE HISTOMAP</text>`,
    `<text x="${W / 2}" y="122" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-size="17" fill="${INK_SOFT}">twelve thousand years of territorial history — the share of state-held land, ${esc(formatYear(timeline.years[0]))} to ${esc(formatYear(timeline.years[n - 1]))}</text>`,
    `<text x="${W / 2}" y="150" text-anchor="middle" font-family="${SERIF}" font-size="12" fill="${INK_SOFT}">after John B. Sparks' Histomap of 1931 · widths are geodesic territorial area, not power · borders before 1650 are approximate zones</text>`,
  )

  // year rows
  for (let i = 0; i < n; i++) {
    const y = posOf(i)
    parts.push(
      `<line x1="${GUTTER - 6}" x2="${GUTTER + STREAM_W}" y1="${y}" y2="${y}" stroke="rgba(58,50,38,0.1)" stroke-width="0.7"/>`,
      `<text x="${GUTTER - 12}" y="${y + 4}" text-anchor="end" font-family="${SERIF}" font-size="12.5" fill="${INK_SOFT}">${esc(formatYear(timeline.years[i]))}</text>`,
    )
  }

  // prehistory caption over the empty rows before the first state era
  const firstStateIdx = timeline.stateArea.findIndex((v) => v > 0)
  if (firstStateIdx > 0) {
    const mid = (posOf(0) + posOf(firstStateIdx)) / 2
    parts.push(
      `<text x="${GUTTER + STREAM_W / 2}" y="${mid.toFixed(1)}" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-size="15" fill="${INK_SOFT}">foragers &amp; first farmers — no states yet</text>`,
    )
  }

  // streams
  for (const l of stacked) {
    const d = pathFor(l.points)
    if (d) parts.push(`<path d="${d}" fill="${l.color}" stroke="rgba(58,50,38,0.3)" stroke-width="0.5"/>`)
  }
  // family dividers
  for (let k = 1; k < stacked.length; k++) {
    const fam = entities[stacked[k].id]?.f ?? `#${stacked[k].id}`
    const prev = entities[stacked[k - 1].id]?.f ?? `#${stacked[k - 1].id}`
    if (fam !== prev) {
      const d = boundaryFor(stacked[k].points)
      if (d) parts.push(`<path d="${d}" fill="none" stroke="rgba(58,50,38,0.45)" stroke-width="1"/>`)
    }
  }

  // collision-aware labels, poster scale
  const placed: Box[] = []
  const CHAR_W = 0.55
  for (const l of [...stacked].sort(
    (a, b) => Math.max(...b.shares) - Math.max(...a.shares),
  )) {
    const candidates = l.points
      .map((p, i) => ({ i, px: (p.a1 - p.a0) * STREAM_W }))
      .filter((c) => c.px >= 16)
      .sort((a, b) => b.px - a.px)
      .slice(0, 14)
    let done = false
    for (const tolerance of [1.2, 2.0]) {
      for (const { i, px } of candidates) {
        let font = Math.max(10.5, Math.min(17, px * 0.32))
        if (l.label.length * font * CHAR_W > px * tolerance)
          font = (px * tolerance) / (l.label.length * CHAR_W)
        if (font < 10.5) continue
        const textW = l.label.length * font * CHAR_W
        const p = l.points[i]
        const y = Math.max(HEADER_H + 14, Math.min(H - FOOTER_H - 8, posOf(i)))
        let x = bx((p.a0 + p.a1) / 2)
        x = Math.max(GUTTER + 4 + textW / 2, Math.min(GUTTER + STREAM_W - 4 - textW / 2, x))
        const box: Box = { x0: x - textW / 2 - 4, x1: x + textW / 2 + 4, y0: y - font / 2 - 3, y1: y + font / 2 + 3 }
        if (placed.some((b) => intersects(b, box))) continue
        placed.push(box)
        const light = luminance(l.color) > 0.62
        parts.push(
          `<text x="${x.toFixed(1)}" y="${(y + font * 0.32).toFixed(1)}" text-anchor="middle" font-family="${SERIF}" font-size="${font.toFixed(1)}" fill="${light ? INK : '#f7f1e0'}" stroke="${light ? 'rgba(244,236,217,0.55)' : 'rgba(40,32,20,0.45)'}" stroke-width="2" paint-order="stroke" stroke-linejoin="round">${esc(l.label)}</text>`,
        )
        done = true
        break
      }
      if (done) break
    }
  }

  // margin notes: events, cascaded so they never overlap
  const yearPos = (y: number): number => {
    const ys = timeline.years
    if (y <= ys[0]) return posOf(0)
    if (y >= ys[n - 1]) return posOf(n - 1)
    let i = 0
    while (ys[i + 1] < y) i++
    return posOf(i) + ROW_H * ((y - ys[i]) / (ys[i + 1] - ys[i]))
  }
  let lastNoteY = 0
  for (const ev of events as { y: number; t: string; k?: string }[]) {
    if (ev.y < timeline.years[0]) continue
    const dotY = yearPos(ev.y)
    const noteY = Math.max(dotY, lastNoteY + 15)
    lastNoteY = noteY
    const battle = ev.k === 'battle'
    parts.push(
      battle
        ? `<circle cx="${GUTTER + STREAM_W + 10}" cy="${dotY.toFixed(1)}" r="3" fill="${PARCHMENT}" stroke="#b23a48" stroke-width="1.6"/>`
        : `<circle cx="${GUTTER + STREAM_W + 10}" cy="${dotY.toFixed(1)}" r="2.6" fill="#b23a48"/>`,
      `<line x1="${GUTTER + STREAM_W + 13}" y1="${dotY.toFixed(1)}" x2="${NOTES_X - 4}" y2="${noteY.toFixed(1)}" stroke="rgba(58,50,38,0.25)" stroke-width="0.6"/>`,
      `<text x="${NOTES_X}" y="${(noteY + 3.4).toFixed(1)}" font-family="${SERIF}" font-size="10.5" fill="${INK}"><tspan fill="${INK_SOFT}">${esc(formatYear(ev.y))}</tspan>  ${battle ? '⚔ ' : ''}${esc(ev.t)}</text>`,
    )
  }

  // footer: family legend + attribution
  const legendY = H - FOOTER_H + 36
  const families = timeline.families
  const perRow = 7
  families.forEach((f, i) => {
    const col = i % perRow
    const row = Math.floor(i / perRow)
    const x = GUTTER + col * 200
    const y = legendY + row * 24
    parts.push(
      `<rect x="${x}" y="${y - 10}" width="12" height="12" rx="2" fill="${f.color}" stroke="rgba(58,50,38,0.3)"/>`,
      `<text x="${x + 18}" y="${y}" font-family="${SERIF}" font-size="11.5" fill="${INK}">${esc(f.label)}</text>`,
    )
  })
  parts.push(
    `<text x="${GUTTER}" y="${H - 26}" font-family="${SERIF}" font-size="11" fill="${INK_SOFT}">Borders: historical-basemaps © André Ourednik (GPL-3.0) · Interactive version, methodology and errata: by32.github.io/interactive-histomap · GPL-3.0</text>`,
  )

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`
}

export async function downloadPoster(timeline: Timeline, entities: EntityIndex): Promise<void> {
  const svg = buildPosterSvg(timeline, entities)
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('poster raster failed'))
      img.src = svgUrl
    })
    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = img.width * scale
    canvas.height = img.height * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no canvas context')
    ctx.scale(scale, scale)
    ctx.drawImage(img, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('png encode failed')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'interactive-histomap-poster.png'
    a.click()
    URL.revokeObjectURL(a.href)
  } catch {
    // fall back to the raw SVG if rasterizing fails
    const a = document.createElement('a')
    a.href = svgUrl
    a.download = 'interactive-histomap-poster.svg'
    a.click()
  } finally {
    setTimeout(() => URL.revokeObjectURL(svgUrl), 5000)
  }
}
