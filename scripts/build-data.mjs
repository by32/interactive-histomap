#!/usr/bin/env node
// Data pipeline for the Interactive Histomap.
// Reads world_*.geojson snapshots from a local clone of
// https://github.com/aourednik/historical-basemaps (GPL-3.0) and emits:
//   public/data/years/<year>.json   TopoJSON per snapshot (props: id,n,c,a,p,k)
//   public/data/timeline.json       per-entity km2 series + stream order
//   public/data/entities.json       entity index for search/info panel
// Usage: npm run build:data -- --src <path-to-historical-basemaps>/geojson [--pct 10%]
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import mapshaper from 'mapshaper'
import area from '@turf/area'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const args = process.argv.slice(2)
const argVal = (name, dflt) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}
const SRC = argVal('--src', null)
const SIMPLIFY_PCT = argVal('--pct', '10%')
if (!SRC || !fs.existsSync(SRC)) {
  console.error('Missing --src <path to historical-basemaps/geojson>')
  process.exit(1)
}

const YEARS = [
  -10000, -8000, -5000, -4000, -3000,
  -2000, -1500, -1000, -700, -500, -400, -323, -300, -200, -100, -1,
  100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1279, 1300,
  1400, 1492, 1500, 1530, 1600, 1650, 1700, 1715, 1783, 1800, 1815, 1880,
  1900, 1914, 1920, 1930, 1938, 1945, 1960, 1994, 2000, 2010,
]
const fileFor = (y) => (y < 0 ? `world_bc${-y}.geojson` : `world_${y}.geojson`)

const FILE_BUDGET_KB = 400
const TOTAL_BUDGET_MB = 10
const STREAM_SHARE = 0.015

const curation = JSON.parse(fs.readFileSync(path.join(__dirname, 'curation.json')))
const correctionsFile = JSON.parse(fs.readFileSync(path.join(__dirname, 'corrections.json')))

const norm = (s) => (s ?? '').toString().trim().replace(/\s+/g, ' ')
const key = (s) => norm(s).toLowerCase()
const slug = (s) =>
  key(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unnamed'

// ---- alias index (entities, year-scoped) --------------------------------
const aliasIndex = new Map() // key -> [{id, from, to}]
for (const [id, ent] of Object.entries(curation.entities)) {
  for (const alias of ent.aliases) {
    const a = typeof alias === 'string' ? { n: alias } : alias
    const k = key(a.n)
    if (!k) continue
    const list = aliasIndex.get(k) ?? []
    for (const prev of list) {
      const from = a.from ?? -Infinity, to = a.to ?? Infinity
      const pf = prev.from ?? -Infinity, pt = prev.to ?? Infinity
      if (from <= pt && pf <= to && prev.id !== id) {
        console.error(`Alias conflict: "${a.n}" claimed by ${prev.id} and ${id} with overlapping year ranges`)
        process.exit(1)
      }
    }
    list.push({ id, from: a.from, to: a.to })
    aliasIndex.set(k, list)
  }
}
const aggregates = new Set((curation.aggregates ?? []).map(key))
const cultureAliases = new Set(curation.cultures.aliases.map(key))
const zoneAliases = new Set((curation.zones ?? []).map(key))
const culturePatterns = curation.cultures.patterns.map((p) => p.toLowerCase())

const resolveAlias = (raw, year) => {
  const list = aliasIndex.get(key(raw))
  if (!list) return null
  for (const a of list) {
    if ((a.from == null || year >= a.from) && (a.to == null || year <= a.to)) return a.id
  }
  return null
}

// ---- classification -----------------------------------------------------
// kind: 's' curated/uncurated state, 'c' culture/zone, 'u' unclaimed
function classify(props, year) {
  // SUBJECTO is a fallback name only when it looks like one (year 100 has a
  // giant unclaimed polygon with SUBJECTO "1" — junk metadata, see ERRATA.md)
  const subj = norm(props.SUBJECTO)
  const rawName = norm(props.NAME) || (/[a-z]/i.test(subj) ? subj : '')
  if (!rawName) return { eid: '_unclaimed', nm: 'Unclaimed / uninhabited', kind: 'u' }
  const curatedId = resolveAlias(rawName, year)
  if (curatedId) return { eid: curatedId, nm: curation.entities[curatedId].label, kind: 's' }
  const k = key(rawName)
  if (aggregates.has(k)) return { eid: '_minor', nm: 'Minor states', kind: 's' }
  if (cultureAliases.has(k) || zoneAliases.has(k)) return { eid: 'z-' + slug(rawName), nm: rawName, kind: 'c' }
  if (culturePatterns.some((p) => k.includes(p))) return { eid: 'z-' + slug(rawName), nm: rawName, kind: 'c' }
  return { eid: 'x-' + slug(rawName), nm: rawName, kind: 's' }
}

// ---- color helpers ------------------------------------------------------
const hexToHsl = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h, s, l]
}
const hslToHex = (h, s, l) => {
  const f = (p, q, t) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  let r, g, b
  if (s === 0) r = g = b = l
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = f(p, q, h + 1 / 3); g = f(p, q, h); b = f(p, q, h - 1 / 3)
  }
  const to = (v) => Math.round(v * 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}
const shade = (hex, step) => {
  // deterministic lightness/hue ladder, cycling so large families never
  // run off into white or black: 9 shade steps, then a small hue nudge
  const [h, s, l] = hexToHsl(hex)
  const DL = [0, 0.06, -0.06, 0.12, -0.12, 0.17, -0.17, 0.09, -0.09]
  const cycle = Math.floor(step / DL.length)
  const dh = (cycle % 3) * 0.022 * (cycle % 2 === 0 ? 1 : -1)
  return hslToHex((h + dh + 1) % 1, s, Math.min(0.78, Math.max(0.24, l + DL[step % DL.length])))
}
const hashStr = (s) => {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h
}

// ---- phase A: correct, classify, clean, dissolve, measure ---------------
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'histomap-'))
const registry = new Map() // eid -> {id, label, kind, family, perYear: Map, firstIdx}
const familyOf = (eid) => curation.entities[eid]?.family ?? null

const msRun = (cmd, inputs) =>
  new Promise((resolve, reject) =>
    mapshaper.applyCommands(cmd, inputs, (err, out) => (err ? reject(err) : resolve(out))),
  )

console.log(`Phase A: clean + dissolve + measure (${YEARS.length} snapshots)`)
for (let yi = 0; yi < YEARS.length; yi++) {
  const year = YEARS[yi]
  const raw = JSON.parse(fs.readFileSync(path.join(SRC, fileFor(year))))
  // corrections
  for (const c of correctionsFile.corrections) {
    if (c.year !== year && c.year !== 'all') continue
    for (let i = raw.features.length - 1; i >= 0; i--) {
      const f = raw.features[i]
      if (key(f.properties?.NAME) !== key(c.whereName)) continue
      if (c.drop) raw.features.splice(i, 1)
      else Object.assign(f.properties, c.set)
    }
  }
  // classify → minimal props
  const features = []
  for (const f of raw.features) {
    if (!f.geometry) continue
    const p = f.properties ?? {}
    const { eid, nm, kind } = classify(p, year)
    let bp = Number(p.BORDERPRECISION)
    if (!(bp >= 1 && bp <= 3)) bp = 1
    features.push({ type: 'Feature', properties: { eid, nm, kind, bp }, geometry: f.geometry })
  }
  const input = JSON.stringify({ type: 'FeatureCollection', features })
  const out = await msRun(
    '-i in.json -clean -dissolve2 eid copy-fields=nm,kind calc="bp = min(bp)" -o out.json format=geojson',
    { 'in.json': input },
  )
  const dissolved = JSON.parse(out['out.json'])
  for (const f of dissolved.features) {
    const { eid, nm, kind } = f.properties
    const km2 = area(f) / 1e6
    f.properties.km2 = km2
    let rec = registry.get(eid)
    if (!rec) {
      rec = { id: eid, label: nm, kind, family: familyOf(eid), perYear: new Map(), firstIdx: yi }
      registry.set(eid, rec)
    }
    rec.perYear.set(yi, (rec.perYear.get(yi) ?? 0) + km2)
  }
  fs.writeFileSync(path.join(TMP, `${year}.json`), JSON.stringify(dissolved))
  process.stdout.write(`  ${String(year).padStart(5)}: ${dissolved.features.length} entities\n`)
}

// ---- phase B: shares, streams, colors, simplify, emit -------------------
const stateArea = YEARS.map((_, yi) => {
  let sum = 0
  for (const rec of registry.values()) if (rec.kind === 's') sum += rec.perYear.get(yi) ?? 0
  return sum
})
const peakShare = (rec) => {
  let best = 0
  for (const [yi, km2] of rec.perYear)
    if (stateArea[yi] > 0) best = Math.max(best, km2 / stateArea[yi])
  return best
}

const familiesById = Object.fromEntries(curation.families.map((f) => [f.id, f]))
const curatedStates = [...registry.values()].filter((r) => r.kind === 's' && r.family)
const uncuratedStates = [...registry.values()].filter(
  (r) => r.kind === 's' && !r.family && r.id !== '_minor',
)

const force = new Set(curation.forceStreams ?? [])
const streams = curatedStates.filter((r) => force.has(r.id) || peakShare(r) >= STREAM_SHARE)
const streamIds = new Set(streams.map((r) => r.id))

// colors: curated entities get a shade ladder within their family
for (const fam of curation.families) {
  const members = curatedStates
    .filter((r) => r.family === fam.id)
    .sort((a, b) => a.firstIdx - b.firstIdx || a.id.localeCompare(b.id))
  members.forEach((r, i) => (r.color = shade(fam.color, i)))
}
for (const r of uncuratedStates) r.color = curation.neutrals[hashStr(r.id) % curation.neutrals.length]
for (const r of registry.values()) {
  if (r.kind === 'c') r.color = curation.cultureTones[hashStr(r.id) % curation.cultureTones.length]
  if (r.kind === 'u') r.color = curation.unclaimedTone
}

console.log(`\nPhase B: simplify (${SIMPLIFY_PCT}) + emit topojson`)
const outDir = path.join(ROOT, 'public', 'data', 'years')
fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })
let totalKB = 0
const oversize = []
for (let yi = 0; yi < YEARS.length; yi++) {
  const year = YEARS[yi]
  const dissolved = JSON.parse(fs.readFileSync(path.join(TMP, `${year}.json`)))
  for (const f of dissolved.features) {
    const rec = registry.get(f.properties.eid)
    f.properties = {
      id: rec.id,
      n: rec.label,
      c: rec.color,
      a: Math.round(f.properties.km2),
      p: f.properties.bp,
      k: rec.kind,
    }
  }
  const out = await msRun(
    `-i in.json -rename-layers world -simplify ${SIMPLIFY_PCT} weighted keep-shapes -clean -o out.json format=topojson quantization=100000`,
    { 'in.json': JSON.stringify(dissolved) },
  )
  const file = path.join(outDir, `${year}.json`)
  fs.writeFileSync(file, out['out.json'])
  const kb = fs.statSync(file).size / 1024
  totalKB += kb
  if (kb > FILE_BUDGET_KB) oversize.push(`${year} (${Math.round(kb)} KB)`)
  process.stdout.write(`  ${String(year).padStart(5)}: ${Math.round(kb)} KB\n`)
}

// ---- timeline.json ------------------------------------------------------
const orderedStreams = streams.sort((a, b) => {
  const fa = familiesById[a.family].order, fb = familiesById[b.family].order
  return fa - fb || a.firstIdx - b.firstIdx || a.id.localeCompare(b.id)
})
const series = {}
for (const r of orderedStreams) series[r.id] = YEARS.map((_, yi) => Math.round(r.perYear.get(yi) ?? 0))
series._other = YEARS.map((_, yi) => {
  let sum = 0
  for (const rec of registry.values())
    if (rec.kind === 's' && !streamIds.has(rec.id)) sum += rec.perYear.get(yi) ?? 0
  return Math.round(sum)
})
const timeline = {
  years: YEARS,
  stateArea: stateArea.map(Math.round),
  families: curation.families,
  streams: [...orderedStreams.map((r) => r.id), '_other'],
  series,
}
fs.writeFileSync(path.join(ROOT, 'public', 'data', 'timeline.json'), JSON.stringify(timeline))

// ---- entities.json ------------------------------------------------------
const entities = {}
const shortNames = curation.shortNames ?? {}
for (const r of registry.values()) {
  if (r.id === '_unclaimed') continue
  entities[r.id] = {
    n: r.label,
    k: r.kind,
    c: r.color,
    ...(shortNames[r.id] ? { s: shortNames[r.id] } : {}),
    ...(r.family ? { f: r.family } : {}),
    ...(curation.entities[r.id]?.wiki ? { w: curation.entities[r.id].wiki } : {}),
    present: YEARS.map((_, yi) => yi).filter((yi) => (r.perYear.get(yi) ?? 0) > 0.5),
    peak: Math.round(Math.max(...r.perYear.values())),
  }
}
entities._other = { n: 'Other states', s: 'Other states', k: 's', c: '#b9a88a', present: [], peak: 0 }
fs.writeFileSync(path.join(ROOT, 'public', 'data', 'entities.json'), JSON.stringify(entities))

// ---- report -------------------------------------------------------------
const sizes = {
  timeline: fs.statSync(path.join(ROOT, 'public', 'data', 'timeline.json')).size / 1024,
  entities: fs.statSync(path.join(ROOT, 'public', 'data', 'entities.json')).size / 1024,
}
console.log(`\ntimeline.json ${Math.round(sizes.timeline)} KB, entities.json ${Math.round(sizes.entities)} KB`)
console.log(`years total: ${(totalKB / 1024).toFixed(1)} MB (${orderedStreams.length} named streams)`)

const needCuration = uncuratedStates
  .map((r) => ({ r, ps: peakShare(r) }))
  .sort((a, b) => b.ps - a.ps)
console.log('\n--- Curation report: top uncurated states by peak share of state land ---')
for (const { r, ps } of needCuration.slice(0, 40)) {
  const peakYi = [...r.perYear.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const flag = ps >= STREAM_SHARE ? '  << QUALIFIES AS STREAM — CURATE' : ''
  console.log(`  ${(ps * 100).toFixed(2).padStart(6)}%  peak@${String(YEARS[peakYi]).padStart(5)}  ${r.label}${flag}`)
}
const failures = []
if (needCuration.some(({ ps }) => ps >= STREAM_SHARE)) failures.push('uncurated entities qualify as streams')
if (oversize.length) failures.push(`files over ${FILE_BUDGET_KB} KB: ${oversize.join(', ')}`)
if (totalKB / 1024 > TOTAL_BUDGET_MB) failures.push(`total ${(totalKB / 1024).toFixed(1)} MB exceeds ${TOTAL_BUDGET_MB} MB`)
fs.rmSync(TMP, { recursive: true, force: true })
if (failures.length) {
  console.error(`\nBUDGET/CURATION CHECK FAILED: ${failures.join('; ')}`)
  process.exit(1)
}
console.log('\nAll checks passed.')
