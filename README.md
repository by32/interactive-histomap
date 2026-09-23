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

**Watch the whole battle** opens a 192-second film in fourteen chapters. It covers the first
two days of assaults, the night march, the allies' withdrawal, the final advance, Leonidas's
death, the retreat to Kolonos, the missile volleys and the Persian victory. Directed shots,
articulated combat, marching, falling defenders and changing light share one seekable clock.
Play/pause, scrub, replay, select 0.5–2× speed or drag the scene to pause and explore;
**Follow camera** rejoins the directed view. Arrow keys seek five seconds, Home/End seek
the endpoints, Space plays/pauses and Escape returns to the walkthrough. Shared links
such as `thermopylae.html#s=10&film=164` open paused at that moment. Reduced-motion settings
start with a stationary overview and free camera. The contemporary terrain remains
available in the walkthrough and its previous setting is restored when leaving the film.

The film compresses historical time; troop routes and choreography are schematic, not
exact reconstructions of individual movements. Each caption links to its passage in Herodotus;
there is no recorded voice track. `film.ts` holds the authored tracks, `timeline.ts` the
shared seekable clock. `npm run test:film` checks time controls, deterministic rewinding,
troop grounding and returning to the walkthrough, without starting a browser.

### Blender pipeline

The soldiers are modelled in Blender, and the same scene can be rendered in Cycles. The
page stays the single source of truth: `npm run export:scene` runs the page's own modules in
Node (terrain, scenery builders, army layouts, the film clock, camera and lighting) and writes
the scene as data to `.cache/thermopylae/scene/`. The Python side in `scripts/blender/` only
builds from that data; it never re-implements terrain or troop logic.

```sh
npm run setup:blender      # one-time: a venv with the pinned bpy wheel (Blender 4.5 LTS as a Python module)
npm run blender:selftest   # Cycles + OpenImageDenoise, the glTF exporter, camera alignment with three.js
npm run build:models       # re-model the soldiers -> public/thermopylae/models/soldiers.glb
```

`scripts/blender/models.py` builds a hoplite, a Persian spearman and an Immortal procedurally,
in every formation's colourway at two levels of detail. The models keep the contract of the
page's vertex rig (`src/thermopylae/soldier.ts`): the same joint heights, `gait` groups for legs,
arms, shield, spear and sword, and a `metal` value per vertex, so the walking and combat
animation is unchanged. The primitive figures remain as a fallback until the models load.
`npm run test:film` checks the models' attributes, triangle budgets and that the armies still
sample the film with them. Set `$BLENDER` to a Blender binary (for example a GPU machine's
install) to run the same scripts under full Blender instead of the Python module.

```sh
npm run bake:terrain       # terrain colour + ambient occlusion -> public/thermopylae/terrain/ (about 12 min on 4 cores)
npm run render:stills      # Cycles stills of every step -> .cache/thermopylae/stills/ (-- --only wall for one)
npm run encode:stills      # AVIF + WebP for the page -> public/thermopylae/stills/
```

**Baked terrain.** `bake.py` bakes the live terrain's colours, enriched with bare earth,
greener grass and maquis scrub, multiplied by ambient occlusion with the oak forest as an
occluder, into a 4096 px texture for 480 BC and for today (a 2048 px version for small or
low-memory devices). Its UVs follow the terrain grid, so about 40% of the texels cover the
coastal strip. The page drapes it over the terrain only while the terrain fingerprint recorded
in `manifest.json` still matches `terrain.ts`; otherwise it keeps the vertex colours.

**Cinematic stills.** `stills.py` renders each walkthrough step in Cycles from the page's own
camera, field of view and step armies. The soldiers are posed by a numpy port of the page's
vertex rig, so every figure stands, walks or fights as it does live. The renders use a
physically based sky and sun from the step's light preset, haze from the page's fog, water
with depth absorption, and the oak forest. When a step settles and the camera has not been
touched, the still fades in over the live view (**Cinematic** chip, `C` key, `#c=0` to turn it
off); any drag or scroll returns to the live scene. A still is shown only while it lines up:
its step fingerprint (camera, formations, terrain, field of view) must match, the camera must
be at the step's viewpoint, and the window may be no wider than the render (2560×1080).
Marching columns hold at the moment the still was taken.

**The rendered film.** `.github/workflows/render-film.yml` renders the page's 192-second
battle film in Cycles on a farm of GitHub-hosted runners. It is manually dispatched from the
Actions tab. The frames are split into up to 20 ranges, rendered in parallel, then
stitched into MP4 and WebM with a poster and chapter track, and optionally published as the
`thermopylae-film` release. The Pages deploy downloads that release into the site, and the film
controls then offer a **Cycles render** button. Try a short cut first (frames `1440-1679`, the
night march, with 4 shards). On a machine with a GPU the same frames render locally:

```sh
npm run export:scene -- --film 0-4607
node scripts/thermopylae/blender.mjs film --start 0 --end 4607 --device OPTIX   # or CUDA, HIP, METAL
node scripts/thermopylae/stitch.mjs    # needs ffmpeg
```

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


### Thermopylae visual reconstruction

The Thermopylae page opens on the complete three-day battle in fourteen shots. Chapter cuts compress elapsed historical time while each close tracking shot keeps the troops moving at walking speed. The original eleven-step walkthrough and ancient/modern coast comparison remain available.

The landscape uses world-space limestone detail, water with integrated, filtered shoreline foam, multisampled scene edges, soft shadows, a sky with atmospheric sunlight, and night-time torch lighting. Near the camera, detailed Greek and Persian models replace distant figures; the colour and shadow rigs animate legs, thrusting spears, drawn swords, surrender and falling figures. Final-stand groups face outwards, with opposing Persian formations on either side. Losses are illustrative, not numerical casualty estimates. On devices without WebGL, an animated shaded-relief atlas preserves the story, playback controls and evidence gallery.

The **Art & evidence** gallery contains institution-supplied photographs of an early-fifth-century Corinthian helmet, an Attic Greek/Persian combat vase (ca. 480–470 BC), and the Susa archer frieze (522–486 BC). Museum records, original image URLs and reuse details are in `public/art/thermopylae/sources.json`. Met images are CC0; the Susa photograph is public domain. The objects inform the visual reconstruction and are not claimed as finds from Thermopylae. Formation colours, figure scale and the schematic geography are explained on the page.
