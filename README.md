# The Interactive Histomap

**Live: https://by32.github.io/interactive-histomap/**

A modern, accurate, interactive, map-based homage to John B. Sparks' 1931 **Histomap**
("Four Thousand Years of World History — Relative Power of Contemporary States, Nations and
Empires", Rand McNally) — the five-foot chart whose colored bands traced civilizations from
2000 BC to the 1930s.

This version keeps the ribbon and adds the map:

- **A world map** (MapLibre GL) of historical polity borders at 52 snapshot years,
  10,000 BC → 2010 AD (it opens at 2000 BC, like the original; the forager world is a scrub
  away), with a time slider. Fully self-contained — no tile server, no API keys, no external
  requests.
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
  play through twelve millennia at three speeds, share any moment via the URL hash
  (`#y=1279&e=mongol-empire`).
- **Named directly on the map** (self-hosted glyphs), with a toggleable layer of ~105
  time-tagged **historical cities**, ~135 curated **event notes** along the ribbon's margin —
  the 1931 original's annotations — including ~40 decisive **battles** that also appear as
  crossed-swords markers on the map at their moment, an **empire-focus mode** that traces a selected polity's
  footprint across every era it existed (with an area-over-time sparkline), and a one-click
  **poster export**: the whole ribbon as a printable wall chart.

## The Thermopylae walkthrough

**Live: https://by32.github.io/interactive-histomap/thermopylae.html**

The Thermopylae battle marker (480 BC) opens a second page: a narrated, browser-native 3D
walkthrough of the pass, built with three.js. Eleven steps carry the camera from Xerxes'
camp at Trachis to the last stand on Kolonos hill — the three gates, the Phocian wall, the
hot springs, the night march of the Immortals along the Anopaea path (torches and all), the
Phocians surprised at dawn, the dismissal of the allies. Armies are drawn as instanced
figures, one per five soldiers, that redeploy between steps; the camera is free to orbit at
any time (`reset view` returns it). `#s=7` deep-links to a step. A **480 BC / today** switch
swaps the gulf for the silted plain as it is now — coast 3–5 km further north, the
Spercheios, the old national road and the A1, the 1955 Leonidas monument — and dashes the
other era's shoreline across each view so the two can be reconciled (`#t=today`).

The terrain is a schematic heightfield generated in the browser from the ancient
descriptions (Herodotus 7.176, 7.198–200, 7.216), not survey data. The shoreline follows the
geological reconstruction of Kraft, Rapp, Szemler, Tziavos & Kase (*Journal of Field
Archaeology* 14, 1987): in 480 BC the Malian Gulf lapped within tens of metres of the cliffs;
the wide plain there today is river silt. The course of the Anopaea is debated; army sizes
are Herodotus' where the narration says so and modern estimates otherwise. All of it is
stated in the page's legend. Source lives in `src/thermopylae/` (`terrain.ts` is the
heightfield, `script.ts` the steps and narration, `units.ts` the armies).

**Watch the night march** opens a 60-second animated sequence, from the Immortals' climb
through the Phocians' retreat at dawn to the allies' withdrawal. Five chapters combine
short captions, directed camera moves, continuous marching and night-to-day lighting.
Play/pause, scrub, replay, select 0.5–2× speed or drag the scene to pause and explore;
**Follow camera** rejoins the directed view. Arrow keys seek five seconds, Home/End seek
the endpoints, Space plays/pauses and Escape returns to the walkthrough. Shared links
such as `thermopylae.html#s=9&film=42` open paused at that moment. Reduced-motion settings
start with a stationary overview and free camera. The contemporary terrain remains
available in the walkthrough and its previous setting is restored when leaving the film.

The film compresses historical time; troop routes and choreography are schematic, not
exact reconstructions of individual movements. Captions follow the existing walkthrough;
there is no recorded voice track. `film.ts` holds the authored tracks, `timeline.ts` the
shared seekable clock. `npm run test:film` checks time controls, deterministic rewinding,
troop grounding and returning to the walkthrough, without starting a browser.

## Development

```sh
npm ci
npm run dev        # dev server
npm run build      # typecheck + production build to dist/
npm run test       # Playwright smoke tests (builds are served via `vite preview`)
```

Node 22 (`.nvmrc`). The MapLibre worker files are served by a small plugin in
`vite.config.ts` — see the comment there before touching MapLibre versions. The site is a
two-page Vite build: `index.html` (the histomap) and `thermopylae.html` (the walkthrough).

## Data

`public/data/` is generated and committed: 52 TopoJSON snapshots (~3.9 MB total),
`timeline.json` (per-polity km² series for ~180 named streams) and `entities.json`.

To regenerate from the upstream dataset:

```sh
git clone --depth 1 https://github.com/aourednik/historical-basemaps /tmp/historical-basemaps
npm run build:data -- --src /tmp/historical-basemaps/geojson
```

The pipeline (`scripts/build-data.mjs`):

1. applies the documented upstream corrections in `scripts/corrections.json` (each with a
   rationale and source),
2. resolves raw names against `scripts/curation.json` — ~280 curated polities in 21
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
