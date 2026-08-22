# Accuracy log (ERRATA)

This project treats accuracy as *fidelity to the best open data plus full transparency about
its limits*. This file logs every check performed against the source data, every correction
applied, and every known limitation we chose to disclose rather than patch.

**Source:** [aourednik/historical-basemaps](https://github.com/aourednik/historical-basemaps),
commit `62d8f1a`, GPL-3.0. 47 snapshots, 2000 BC – 2010 AD.
**Pipeline:** `scripts/build-data.mjs` with `scripts/curation.json` (name → polity resolution)
and `scripts/corrections.json` (documented upstream patches). Areas are geodesic
(`@turf/area`), computed after overlap resolution and before simplification.

## Reference-fact QA checklist

Run against the generated `timeline.json` (areas in km², shares of state-held land):

| # | Check | Result | Detail |
|---|-------|--------|--------|
| 1 | 2000 BC: early river-valley states dominate the named streams | **PASS** | Indus 25.8%, Sumer 19.1%, Egypt 10.9%, Elam, Xia, Hittite-era Anatolia all present |
| 2 | 323 BC: Alexander's empire spans Greece→Indus | **PASS** | Macedon 4.97M km² (35.6% of state land), consistent with the conventional ~5.2M km² estimate |
| 3 | 100–200 AD: Rome near peak (~4–5M km²), Han comparable | **PASS** | Rome 4.62M (100) → 4.91M (200); Han 4.07M — both match standard estimates |
| 4 | 1279: the Mongol realms are by far the largest polity | **PASS** | Yuan + Golden Horde + Ilkhanate + Chagatai = 22.8M km² (~49% of state land), consistent with ~24M km² for the whole empire |
| 5 | 1500: Ottoman, Ming, Inca, Aztec all present | **PASS** | Ottoman 1.09M, Ming 4.16M, Inca 1.55M, Aztec 0.34M, Spain 0.35M, Portugal 0.09M |
| 6 | 1815: post-Napoleonic Europe, Russian Empire large | **PASS** | Russia 19.98M; France back to 0.54M (hexagon), Austria 0.61M, Prussia 0.26M |
| 7 | 1920: British Empire at/near maximum extent | **PASS (with note)** | Strictly-British-labelled territories sum to 28.3M km². The famous ~35.5M km² figure additionally counts territories this dataset labels separately (Egypt as a protectorate, Burma, Malaya, Pacific islands) |
| 8 | 1938: Austria shown inside Germany (Anschluss, Mar 1938) | **PASS** | The 1938 snapshot has no separate Austria; Germany is 0.56M km² ≈ Germany + Austria combined |
| 9 | 2010: borders match the contemporary world map | **PASS** | Visual sweep; no antimeridian artifacts observed |

## Corrections applied to upstream data

Both live in `scripts/corrections.json` with full rationale and citation; they are applied
before any processing so they are reproducible:

1. **1500 BC, "Zhoa" → "Shang".** The snapshot labels the Chinese heartland "Zhoa"; around
   1500 BC that polity is the Shang state (c. 1600–1046 BC). "Zhoa" appears to be a garbled
   "Zhou", which had not yet risen. (Britannica, *Shang dynasty*; Cambridge History of
   Ancient China, 1999.) The same string at 1000 BC *is* kept as Zhou — the Western Zhou era —
   via a name alias rather than a correction.
2. **1930, "White Russia" → "USSR".** The 1930 snapshot labels the entire Soviet Union
   (spanning −180…180°E) "White Russia". The USSR existed from December 1922 and the White
   movement was defeated by 1923; the sibling 1920 snapshot labels the union "USSR" and uses
   "White Russia" for the Belarus region (its literal meaning), which we follow.
   (Britannica, *Soviet Union*.)

## Data-hygiene rules (not historical judgments)

- **Junk `SUBJECTO` values**: the 100 AD snapshot contains a 17.6M km² polygon with no `NAME`
  and `SUBJECTO: "1"` covering the unorganized interior of Asia. `SUBJECTO` is used as a
  fallback name only when it contains at least one letter; this polygon is therefore
  classified as unclaimed land, which is what its geography indicates.
- **Upstream misspellings** are mapped to canonical polities via aliases (display names are
  corrected, geometry untouched): "Khoiasan" (Khoisan), "Anglo-Egyption Sudan",
  "Poland-Llituania", "Zhow states", "Celltic Hallsatt culture", "Cimerians", "Peshemegs"
  (Pechenegs), "Satavahanihara", "Makkura" (Makuria), "Quazaq Khanate", "Turcik tribes",
  "Castille", among others.

## Disclosed limitations (deliberately not patched)

- **State vs. cultural-zone classification.** Hunter-gatherer zones, archaeological cultures
  and broad tribal areas render on the map but are excluded from the ribbon and its
  denominator. The line is a judgment call (e.g. steppe khaganates count as states; "Saharan
  pastoral nomads" do not) and is fully encoded in `scripts/curation.json`.
- **Named-stream selection.** A polity gets its own ribbon stream if it ever held ≥1.5% of
  state land, *plus* a curated canon of historically pivotal smaller states (France, Britain,
  Spain, Japan, Aztec…) that a pure area threshold would bury — territorial extent is not
  power. Everything else aggregates into "Other states".
- **Overlaps are flattened.** Overlapping/suzerain claims are mosaicked so land is counted
  once; where the dataset deliberately overlaps claims, ours resolves them deterministically.
- **The two Jin dynasties.** The dataset uses "Jin" both for Jin 晋 (266–420) and the Jurchen
  Jin 金 (1115–1234). Era-scoped aliases split them into separate polities (`jin-china`,
  `jin-jurchen`), both in the China family.
- **Era-ambiguous names** ("Egypt", "Persia", "Mali", "India", "Manchuria", "Algeria"…) are
  resolved by year ranges; boundaries follow the conventional dates (e.g. "India" → British
  India until 1946, Republic of India from 1947; "Manchuria" → Qing sphere until 1911,
  Republican-era warlord China after).
- **Hittites at 2000 BC.** The dataset shows a Hittite-labelled Anatolia at 2000 BC, about
  three centuries before the conventional Hittite Old Kingdom; we display the dataset as-is.
- **Colonial territories** are colored by metropole family when the dataset labels them as
  colonial ("(UK)", "(France)", "Viceroyalty of…"), and by their own region once independent.
  Egypt under the British protectorate stays in the Egypt family — its stream identity, like
  the 1931 original's, follows the land.
- **Border precision is era-wide.** Upstream rates essentially all borders before ~1650 as
  "approximate" (rendered as dashes in-app) and modern ones as treaty-defined; frontier zones,
  not lines, are the honest reading of every pre-modern border here.
- **Antarctica** and similar non-polity landmasses are excluded from the state-land
  denominator.
