# The Interactive Histomap

A modern, accurate, interactive, map-based homage to John B. Sparks' 1931 **Histomap**
("Four Thousand Years of World History — Relative Power of Contemporary States, Nations and
Empires", Rand McNally) — the five-foot chart whose colored bands traced civilizations from
2000 BC to the 1930s.

This version keeps the ribbon and adds the map:

- **A world map** (MapLibre GL) of historical polity borders at 47 snapshot years,
  2000 BC → 2010 AD, scrubbed with a time slider. Fully self-contained — no tile server, no
  API keys, no external requests.
- **A histomap-style ribbon** — vertical on desktop, time flowing top-to-bottom exactly like
  the original — where each stream's width is that civilization's **share of all land held by
  organized polities**. Sparks sized his bands by an undefined feeling of "relative power";
  here the widths are geodesic territorial area computed from open border data. The ribbon
  doubles as the time scrubber.
- **Honest uncertainty**: dashed borders mark eras the source rates as approximate (nearly
  everything before ~1650); the axis defaults to true linear time with a compressed toggle;
  cultural/tribal zones render on the map but are excluded from the ribbon's denominator —
  all of it disclosed in the in-app *About* panel and [ERRATA.md](ERRATA.md).
- Hover and click either view (they stay in sync), search ~2,300 polities and cultures,
  play through four millennia, share any moment via the URL hash (`#y=1279&e=mongol-empire`).

## Development

```sh
npm ci
npm run dev        # dev server
npm run build      # typecheck + production build to dist/
npm run test       # Playwright smoke tests (builds are served via `vite preview`)
```

Node 22 (`.nvmrc`). The MapLibre worker files are served by a small plugin in
`vite.config.ts` — see the comment there before touching MapLibre versions.

## Data

`public/data/` is generated and committed: 47 TopoJSON snapshots (~3.7 MB total),
`timeline.json` (per-polity km² series for ~180 named streams) and `entities.json`.

To regenerate from the upstream dataset:

```sh
git clone --depth 1 https://github.com/aourednik/historical-basemaps /tmp/historical-basemaps
npm run build:data -- --src /tmp/historical-basemaps/geojson
```

The pipeline (`scripts/build-data.mjs`):

1. applies the documented upstream corrections in `scripts/corrections.json` (each with a
   rationale and source),
2. resolves raw names against `scripts/curation.json` — ~230 curated polities in 21
   civilization families, with era-scoped aliases for names that mean different things in
   different centuries ("Mali", "Persia", the two Jin dynasties),
3. classifies archaeological cultures and tribal zones separately (they render, but don't
   count as states),
4. cleans and dissolves geometry (mapshaper), measures geodesic areas **before**
   simplification (@turf/area), then simplifies aggressively for the web,
5. fails loudly if any polity big enough to deserve a named stream is missing curation, or
   if the output exceeds its size budget.

Accuracy methodology, the QA checklist, and every known limitation are logged in
[ERRATA.md](ERRATA.md).

## Deploying

GitHub Pages via Actions — see [docs/DEPLOY.md](docs/DEPLOY.md) (one-time setup: repo
Settings → Pages → Source: *GitHub Actions*).

## License & attribution

- Border data: [historical-basemaps](https://github.com/aourednik/historical-basemaps) by
  **André Ourednik**, GPL-3.0. The committed TopoJSON in `public/data/` is a processed
  derivative of that dataset.
- This project (code, curation tables, generated data): **GPL-3.0** — see [LICENSE](LICENSE).
- Inspired by *The Histomap*, John B. Sparks, Rand McNally, 1931.
