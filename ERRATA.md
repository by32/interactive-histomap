# Accuracy log (ERRATA)

This project treats accuracy as *fidelity to the best open data plus full transparency about
its limits*. This file logs every check performed against the source data, every correction
applied, and every known limitation we chose to disclose rather than patch.

**Source:** [aourednik/historical-basemaps](https://github.com/aourednik/historical-basemaps),
commit `62d8f1a`, GPL-3.0. 52 snapshots, 10,000 BC – 2010 AD (the upstream 123,000 BC
Ice-Age snapshot is deliberately excluded).
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

All live in `scripts/corrections.json` with full rationale and citation; they are applied
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

3. **700 AD, "Sui Empire" → "Tang Empire".** The Sui fell in 618; in 700 China was ruled
   by the Tang (618–907). The label appears carried over from the 600 AD snapshot.
   (Britannica, *Tang dynasty*.)
4. **700 AD, "Sasanian Empire" / "Sasanian dependencies" / "Hejaz" → "Umayyad Caliphate".**
   The Sasanian state was destroyed by the Arab conquest (last king killed 651); by 700 Iran,
   Mesopotamia and the Hejaz were governed by the Umayyad Caliphate. Before these relabels
   the snapshot drew the caliphate at 1.7M km²; after them it reaches ~4.8M km². **It remains
   under-drawn**: the dataset shows Egypt and the Maghreb — Umayyad by 700 — as unlabeled or
   nomadic zones, and no relabel can supply missing geometry. (Britannica, *Sasanian
   dynasty*, *Umayyad dynasty*.)
5. **1492–1880, "Papua New Guinea" → "Papuans".** Six pre-colonial snapshots label eastern
   New Guinea with the name of a state founded in 1975, and the pipeline had counted it as
   0.42M km² of state land (0.6% of the 1492 world). No state existed there; the polygon is
   rendered as a cultural zone under the dataset's own "Papuans" label. The 1900 snapshot
   (German north, British south, drawn as one shape) is left as the dataset gives it; from
   1914 the shape is resolved to Australian administration and from 1975 to the independent
   state by year-scoped aliases. (Britannica, *Papua New Guinea*.)
6. **1000 AD, Greenland "Denmark-Norway" → "Norse Greenland".** The snapshot labels all of
   Greenland (2.1M km²) with a union that only formed in 1524. The Norse settlements founded
   c. 985 governed themselves until they accepted Norwegian sovereignty in 1261; Denmark's
   colonial claim dates from 1721. Rendered as a cultural zone, so it no longer adds two
   million km² to the Danish stream. The 1400 and 1500 "Kalmar Union" labels for Greenland
   are kept as the dataset's reading of the crown's nominal claim. (Britannica, *Greenland*.)
7. **1938 and 1945, "Israel" → "Mandatory Palestine".** Israel was proclaimed on 14 May
   1948; in both snapshots the territory was the British Mandate for Palestine (1920–48).
   (Britannica, *Palestine*, *Israel*.)

## Data-hygiene rules (not historical judgments)

- **Junk `SUBJECTO` values**: the 100 AD snapshot contains a 17.6M km² polygon with no `NAME`
  and `SUBJECTO: "1"` covering the unorganized interior of Asia. `SUBJECTO` is used as a
  fallback name only when it contains at least one letter; this polygon is therefore
  classified as unclaimed land, which is what its geography indicates.
- **Upstream misspellings** are mapped to canonical polities via aliases, and cultural-zone
  typos to corrected display names via `cultureLabels` in `scripts/curation.json` (geometry
  untouched): "Khoiasan" (Khoisan), "Anglo-Egyption Sudan", "Poland-Llituania", "Zhow
  states", "Celltic Hallsatt culture", "Cimerians", "Peshemegs" (Pechenegs),
  "Satavahanihara", "Makkura" (Makuria), "Quazaq Khanate", "Turcik tribes", "Castille",
  "Kwarizm-Shah", "Bukara Khanate", "Rajastan", "Kingdom of Kassander",
  "Eastern North Amercian hunter-gatherers", "Caloosahatchee cultureure", "Dakapeng"
  (Dapenkeng), "Naquada" (Naqada), "Sambian-Nothangian" (Natangian), "Volga-Kamm"
  (Volga-Kama), "Plateau fichers", among others. French plural forms ("Papous", "Sarmates",
  "Daces", "Touareg") are given their English names, and spelling variants of one zone
  ("Athabascan"/"Athabaskan", "Saami"/"Sámi") are merged. Peoples that the dataset draws
  as states (Yayoi, Sámi, Olmec, Blemmyes, Pomo, Shoshoni, Apache, Māori, the Old Prussians, and
  the Aboriginal Australian Kalaamaya, Badimaya and Kungarakany) are classified as cultural
  zones so they do not enter the state-land denominator.
- **"Mali" across eras.** The dataset uses the bare label for the Mali Empire's remnant
  through 1715 and for French Sudan in 1945 (the modern republic dates from 1960); the
  alias ranges follow those uses (Mali Empire to 1750; modern Mali from 1900).
- **Indigenous-nation mosaics.** From 1492 the dataset fills the Americas, Australia and
  Siberia with hundreds of named peoples (Ute, Crow, Emberá, Wiradjuri, Nenets…) drawn like
  polities — 8–16% of nominal state land in 1492–1715 for North America, 14% for South
  America in 1492, 7–9% for Australia in 1600–1800. These are peoples, not states, so every
  uncurated polygon inside those regions and eras is classified as a cultural zone
  (`indigenousZones` in `scripts/curation.json`; South America and the Caribbean only in
  1492, before colonial claims cover them); real states and colonial territories inside the
  boxes (the Kazan Khanate, the Muisca, Spanish Florida, Virginia, the Victoria colony) are
  curated by name or excepted. Mesoamerica is left as the dataset classifies it, because
  there states (Aztec, Tarascan, Mixtec) and peoples (Otomí, Lenca) sit side by side.
- **Colonial and post-colonial Africa.** German, Portuguese, Dutch and Italian colonial
  holdings are grouped under their metropole families; the larger post-independence states are
  curated as individual polities in the Africa family so that the 1994 and 2010 maps read
  as coherent shades rather than uncurated gray.

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
  Republican-era warlord China after; "Ceylon" → Sinhalese kingdoms until 1795, British
  Ceylon 1796–1947, Sri Lanka from 1948; "Paraguay" → the Río de la Plata viceroyalty until
  1810; "Gabon" → French Equatorial Africa until 1959; the 1945 "Korea (USSR)" and
  "Korea (USA)" occupation zones → the two Koreas they became in 1948, while the four
  German and the American Japanese occupation zones of 1945 → Germany and Japan; "Annam" and "Cochin
  China" → Vietnam until the French protectorate and colony (1884 / 1859), French Indochina
  after; "Sardinia" → the Savoyard kingdom only from 1720; "Venetia" → Venice until 1797,
  Austria after; "Ottoman Sultanate" → the Ottoman state until 1922 and, where the 1930
  snapshot still uses the label, the Republic of Turkey).
- **Deep-time anachronisms.** The prehistoric snapshots label a few regions with much later
  polities ("Hurrian Kingdoms", Elam and Norte Chico appear from 5000 BC, millennia before
  any of them existed as organized states). They still render on the map as given, but
  snapshots whose nominal state land totals under 1M km² are treated as having no meaningful
  state record: the ribbon's denominator is zeroed there, so streams begin at 4000 BC — where
  the dataset's substantive state record (and the linear axis break) starts. Without this, a
  75%-of-nothing sliver would paint Norte Chico as spanning the 5000 BC world.
- **Events, battles and cities are curated.** The margin-note events (~135, of which ~40 are
  decisive battles) and the historical-cities layer (the dataset's ~60 time-tagged places
  plus ~45 curated capitals in `scripts/curation.json`) use conventional dates from common
  reference works. Battle coordinates are approximate to the traditional site, each battle
  marker appears at the snapshot nearest its year, and founding dates of ancient cities are
  traditional, not precise.
- **Hittites at 2000 BC.** The dataset shows a Hittite-labelled Anatolia at 2000 BC, about
  three centuries before the conventional Hittite Old Kingdom; we display the dataset as-is.
- **Korea under the Mongols.** The 1279–1400 snapshots draw the peninsula inside the Mongol
  "Great Khanate" — defensible for Goryeo as a Yuan vassal in 1279–1300, wrong for 1400,
  when Joseon had ruled since 1392 and the Yuan had fallen. The polygon spans Mongolia and
  Manchuria too, so no relabel can separate it; the Korea stream is simply absent in those
  snapshots. Balhae (698–926) is counted with Korea, following the conventional Korean
  sequence.
- **Colonial territories** are colored by metropole family when the dataset labels them as
  colonial ("(UK)", "(France)", "Viceroyalty of…"), and by their own region once independent.
  Egypt under the British protectorate stays in the Egypt family — its stream identity, like
  the 1931 original's, follows the land.
- **Border precision is era-wide.** Upstream rates essentially all borders before ~1650 as
  "approximate" (rendered as dashes in-app) and modern ones as treaty-defined; frontier zones,
  not lines, are the honest reading of every pre-modern border here.
- **Antarctica** and similar non-polity landmasses are excluded from the state-land
  denominator.
