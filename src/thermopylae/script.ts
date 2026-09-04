/**
 * The walkthrough: who stands where at each step, where the camera goes, and
 * what the narration says. Positions are in the terrain's metre coordinates
 * (x west→east, z north→south); heights are resolved against the heightfield
 * at runtime.
 */

export type Side = 'greek' | 'persian'

export interface GroupDef {
  id: string
  label: string
  side: Side
  /** tunic / cloak colour */
  color: number
  /** figures rendered; each figure stands for FIGURE_SCALE men */
  count: number
}

/** one rendered figure represents this many soldiers */
export const FIGURE_SCALE = 5

export const GROUPS: GroupDef[] = [
  { id: 'spartans', label: 'Spartans — 300', side: 'greek', color: 0xa8262c, count: 60 },
  { id: 'thespians', label: 'Thespians — 700', side: 'greek', color: 0x2f5a9c, count: 140 },
  { id: 'thebans', label: 'Thebans — 400', side: 'greek', color: 0x4a8a40, count: 80 },
  {
    id: 'allies',
    label: 'Peloponnesians, Locrians & others — ~4,500',
    side: 'greek',
    color: 0x9c8a3a,
    count: 900,
  },
  { id: 'phocians', label: 'Phocians on the mountain — 1,000', side: 'greek', color: 0x5f93a6, count: 200 },
  {
    id: 'host',
    label: 'Persian host — 30,000 of Xerxes’ 70,000+ shown',
    side: 'persian',
    color: 0xb9752f,
    count: 6000,
  },
  { id: 'medes', label: 'Medes & Cissians — ~10,000', side: 'persian', color: 0xd6a03c, count: 2000 },
  { id: 'immortals', label: 'The Immortals — 10,000', side: 'persian', color: 0x6a3d9e, count: 2000 },
]

/**
 * Where a placement stands. On the coastal track give `f`, the fraction of
 * the strip's width measured from the cliff foot (0) to the shore (1); every
 * figure is then kept on the flat. On the mountain give an absolute `z`.
 */
interface Spot {
  x: number
  z?: number
  f?: number
}

export type Placement =
  | { kind: 'hidden' }
  | (Spot & {
      kind: 'block'
      /** direction the front rank faces, radians (0 = +z south, π/2 = +x east) */
      heading: number
      cols: number
      spacing?: number
    })
  | (Spot & { kind: 'scatter'; rx: number; rz: number })
  | (Spot & { kind: 'ring'; rMin: number; rMax: number })
  | {
      kind: 'column'
      /** fraction of the Anopaea path covered by the head and tail of the column */
      t0: number
      t1: number
      abreast: number
      /** path fraction per second the column keeps marching after arriving */
      march?: number
    }

export type Lighting = 'day' | 'dawn' | 'night' | 'dusk'

export interface CameraSpot {
  /** x, z, metres above ground */
  pos: [number, number, number]
  target: [number, number, number]
}

export interface Stage {
  id: string
  kicker: string
  title: string
  /** narration; simple inline HTML */
  text: string
  camera: CameraSpot
  light: Lighting
  units: Record<string, Placement>
  /** light up the Anopaea path */
  path?: boolean
}

const WEST = -Math.PI / 2 // facing −x
const EAST = Math.PI / 2 // facing +x
const MID = 0.5

const block = (x: number, heading: number, cols: number, spacing = 2.4): Placement => ({
  kind: 'block',
  x,
  f: MID,
  heading,
  cols,
  spacing,
})
const scatter = (x: number, f: number, rx: number, rz: number): Placement => ({ kind: 'scatter', x, f, rx, rz })
const HIDDEN: Placement = { kind: 'hidden' }

const PHOCIAN_POST: Placement = { kind: 'scatter', x: 300, z: 1420, rx: 90, rz: 60 }
const PHOCIAN_REFUGE: Placement = { kind: 'scatter', x: 420, z: 1560, rx: 60, rz: 45 }

const greeksAtWall: Record<string, Placement> = {
  spartans: block(-40, WEST, 8),
  thespians: block(130, WEST, 10),
  thebans: block(200, WEST, 8, 2.6),
  allies: scatter(620, MID, 280, 120),
  phocians: PHOCIAN_POST,
}

const persianCamp: Record<string, Placement> = {
  host: scatter(-2950, 0.3, 600, 520),
  medes: scatter(-2450, 0.85, 220, 200),
  immortals: scatter(-3000, 0.5, 260, 200),
}

export const STAGES: Stage[] = [
  {
    id: 'overview',
    kicker: 'August 480 BC',
    title: 'The Hot Gates',
    text:
      'Xerxes’ army has marched from the Hellespont through Thrace, Macedonia and Thessaly. The Greek alliance chooses to hold two bottlenecks at once: the fleet at Artemisium, and the army here, where Mount Kallidromo drops into the Malian Gulf and leaves a coastal track pinched into three narrow <em>gates</em>. In 480 BC the sea lapped almost at the foot of the cliffs; the wide plain there today is twenty-five centuries of river silt. Sulphur springs beside the middle gate gave the pass its name: <em>Thermopylae</em>, the Hot Gates.',
    camera: { pos: [1900, -2400, 1500], target: [-400, -250, 0] },
    light: 'day',
    units: { ...greeksAtWall, ...persianCamp },
  },
  {
    id: 'trachis',
    kicker: 'The Persian camp',
    title: 'Xerxes waits at Trachis',
    text:
      'The Great King camps on the Spercheios plain beneath Trachis, across the river Asopos. Herodotus counts 1,700,000 fighting men; modern estimates run from 70,000 to 300,000, and any of them dwarfs the 7,000 Greeks. A mounted scout rides up to the pass and reports Spartans exercising and combing their long hair. Demaratus, the exiled Spartan king in Xerxes’ train, explains what it means: they are preparing to die. Xerxes waits four days for the Greeks to run away.',
    camera: { pos: [-1250, -1700, 520], target: [-2900, -500, 40] },
    light: 'day',
    units: { ...greeksAtWall, ...persianCamp },
  },
  {
    id: 'wall',
    kicker: 'The Greek position',
    title: 'The Middle Gate and the Phocian Wall',
    text:
      'Leonidas holds the middle gate, where Herodotus says the track is a single wagon-width. The Phocians had once built a wall here against Thessalian raids; the Greeks rebuild it and pitch camp behind. Roughly 7,000 hoplites: 300 Spartans, each chosen because he had a living son; 700 Thespians; 400 Thebans; some 2,800 other Peloponnesians; the Opuntian Locrians in full force; and 1,000 Phocians, posted on the mountain. The hot springs bubble a few hundred paces to the west.',
    camera: { pos: [-150, -450, 45], target: [50, -285, 5] },
    light: 'day',
    units: { ...greeksAtWall, ...persianCamp },
  },
  {
    id: 'day1-medes',
    kicker: 'Day one',
    title: 'The Medes are thrown back',
    text:
      'On the fifth day Xerxes attacks. The Medes and Cissians come first and, in Herodotus’ word, are <em>butchered</em>: on a front a few dozen men wide, numbers count for nothing, and Greek spears out-reach Persian ones. The allied contingents fight in rotation, city by city, and the Spartans stage feigned retreats that draw the Persians on to their spears. When told that Persian arrows would hide the sun, the Spartan Dieneces answered that they would fight in the shade.',
    camera: { pos: [-470, -560, 120], target: [-160, -250, 5] },
    light: 'day',
    units: {
      spartans: block(-110, WEST, 8),
      thespians: block(20, WEST, 10),
      thebans: block(170, WEST, 8, 2.6),
      allies: scatter(560, MID, 260, 110),
      phocians: PHOCIAN_POST,
      host: scatter(-2750, 0.3, 550, 480),
      medes: block(-205, EAST, 40, 2.6),
      immortals: scatter(-1300, MID, 230, 120),
    },
  },
  {
    id: 'day1-immortals',
    kicker: 'Day one, afternoon',
    title: 'The Immortals fare no better',
    text:
      'Xerxes sends in the Immortals: Hydarnes’ 10,000, the royal guard, so called because a fallen man was replaced at once. In the gate their wicker shields and short spears are no use, and the phalanx holds. Watching from a throne set on the slope, the king is said to have leapt to his feet three times in fear for his army.',
    camera: { pos: [-380, -440, 38], target: [-170, -280, 6] },
    light: 'day',
    units: {
      spartans: block(-120, WEST, 8),
      thespians: block(10, WEST, 10),
      thebans: block(160, WEST, 8, 2.6),
      allies: scatter(560, MID, 260, 110),
      phocians: PHOCIAN_POST,
      host: scatter(-2750, 0.3, 550, 480),
      medes: scatter(-1200, MID, 300, 130),
      immortals: block(-215, EAST, 40, 2.6),
    },
  },
  {
    id: 'day2',
    kicker: 'Day two',
    title: 'The assaults fail again',
    text:
      'The Persians try once more, hoping wounds and exhaustion will tell. They do not: the wall, the rotation of fresh contingents and the discipline of the phalanx hold. Xerxes is, Herodotus says, <em>at a loss</em> — until a Malian from Trachis, Ephialtes son of Eurydemus, asks to see him. He knows a path over the mountain, and he wants to be paid for it.',
    camera: { pos: [-140, 20, 160], target: [-220, -260, 5] },
    light: 'day',
    units: {
      spartans: block(100, WEST, 8),
      thespians: block(-120, WEST, 10),
      thebans: block(10, WEST, 8, 2.6),
      allies: scatter(560, MID, 260, 110),
      phocians: PHOCIAN_POST,
      host: block(-700, EAST, 70, 2.8),
      medes: block(-240, EAST, 40, 2.6),
      immortals: scatter(-1300, MID, 230, 120),
    },
  },
  {
    id: 'anopaea',
    kicker: 'Night of day two',
    title: 'Ephialtes leads the Immortals over the mountain',
    text:
      'At the hour when the lamps are lit, Hydarnes and the Immortals leave camp with Ephialtes as their guide. The Anopaea path climbs from the gorge of the Asopos, follows the spine of Kallidromo through oak forest, and comes down behind the East Gate at Alpeni. They march all night. Leonidas knew of the path: it is why the 1,000 Phocians were posted near its summit, on ground of their own choosing.',
    camera: { pos: [-3300, -1300, 950], target: [-1200, 900, 0] },
    light: 'night',
    path: true,
    units: {
      ...greeksAtWall,
      host: scatter(-2750, 0.3, 550, 480),
      medes: scatter(-2450, 0.85, 220, 200),
      immortals: { kind: 'column', t0: 0.02, t1: 0.36, abreast: 3, march: 0.004 },
    },
  },
  {
    id: 'dawn',
    kicker: 'Dawn, day three',
    title: 'The Phocians are surprised',
    text:
      'Near the summit, in the still air before sunrise, the Phocians hear the tread of thousands of feet on fallen oak leaves. They arm too late. Hydarnes at first fears they are Spartans; Ephialtes tells him otherwise, and the Persians shower them with arrows. The Phocians withdraw to a hilltop and brace themselves to die — but the Immortals ignore them and hurry on downhill. Behind them, lookouts are already running down toward the Greek camp.',
    camera: { pos: [-200, 1900, 300], target: [400, 1450, 15] },
    light: 'dawn',
    path: true,
    units: {
      ...greeksAtWall,
      phocians: PHOCIAN_REFUGE,
      host: scatter(-2750, 0.3, 550, 480),
      medes: scatter(-2450, 0.85, 220, 200),
      immortals: { kind: 'column', t0: 0.42, t1: 0.72, abreast: 3, march: 0.004 },
    },
  },
  {
    id: 'dismissal',
    kicker: 'Morning, day three',
    title: 'Leonidas dismisses the allies',
    text:
      'A deserter from Xerxes’ camp, Tyrrhastiadas of Cyme, brings the same news the lookouts do: the pass is turned. At a hurried council most of the allies are released, and they march east through Alpeni while they still can. The 700 Thespians under Demophilus refuse to go. The Thebans stay too — as hostages, Herodotus insists. The Spartans remain because, in his words, it was not fitting for them to abandon the post they had come to guard.',
    camera: { pos: [-350, -700, 280], target: [600, -280, 8] },
    light: 'day',
    path: true,
    units: {
      spartans: block(40, WEST, 8),
      thespians: block(140, WEST, 10),
      thebans: block(230, WEST, 8, 2.6),
      allies: { kind: 'block', x: 2050, f: 0.4, heading: EAST, cols: 12, spacing: 2.6 },
      phocians: PHOCIAN_REFUGE,
      host: block(-900, EAST, 70, 2.8),
      medes: block(-1500, EAST, 44, 2.6),
      immortals: { kind: 'column', t0: 0.78, t1: 0.995, abreast: 3, march: 0.003 },
    },
  },
  {
    id: 'last-stand',
    kicker: 'Midday, day three',
    title: 'The last stand on Kolonos hill',
    text:
      'Knowing the end, the Greeks advance past the wall into the wider ground and fight Xerxes’ frontal assault until their spears splinter. Persian officers drive their men on with whips; many are trampled, or forced into the sea. Leonidas falls, and four times the Spartans recover his body. When the Immortals appear at their backs the survivors retreat to this mound and fight with swords, then hands and teeth, until the Persians, Herodotus writes, <em>buried them under missiles</em>. The Thebans surrender. Xerxes has Leonidas’ head cut off and his body impaled.',
    camera: { pos: [230, -430, 70], target: [350, -140, 12] },
    light: 'day',
    units: {
      spartans: { kind: 'ring', x: 350, z: -125, rMin: 0, rMax: 26 },
      thespians: { kind: 'ring', x: 350, z: -125, rMin: 18, rMax: 40 },
      thebans: { kind: 'scatter', x: 480, z: -190, rx: 40, rz: 22 },
      allies: HIDDEN,
      phocians: PHOCIAN_REFUGE,
      host: block(120, EAST, 60),
      medes: block(-200, EAST, 40, 2.6),
      immortals: { kind: 'ring', x: 350, f: MID, rMin: 60, rMax: 170 },
    },
  },
  {
    id: 'aftermath',
    kicker: 'Aftermath',
    title: '“Go, tell the Spartans”',
    text:
      'The pass is open. The fleet withdraws from Artemisium; Athens is evacuated and burned; the war is decided at Salamis that September and at Plataea the following summer. On this mound the Amphictyons later set up Simonides’ epitaph: <em>Stranger, tell the Spartans that here we lie, obedient to their words.</em> In 1939 Spyridon Marinatos found Persian bronze arrowheads scattered over Kolonos — the spot where the missiles fell.',
    camera: { pos: [400, -150, 22], target: [-1700, -900, 60] },
    light: 'dusk',
    units: {
      spartans: HIDDEN,
      thespians: HIDDEN,
      thebans: HIDDEN,
      allies: HIDDEN,
      phocians: HIDDEN,
      host: scatter(-600, MID, 700, 150),
      medes: HIDDEN,
      immortals: scatter(900, MID, 350, 120),
    },
  },
]

export interface LabelDef {
  text: string
  x: number
  z: number
  /** metres above ground */
  up?: number
  /** de-emphasised place name */
  minor?: boolean
}

export const LABELS: LabelDef[] = [
  { text: 'Malian Gulf', x: -300, z: -1700, up: 2 },
  { text: 'Mount Kallidromo', x: 100, z: 1750, up: 40 },
  { text: 'West Gate', x: -2000, z: -235, up: 12 },
  { text: 'Middle Gate · Phocian Wall', x: 60, z: -285, up: 10 },
  { text: 'East Gate', x: 1500, z: -250, up: 12 },
  { text: 'Hot springs', x: -210, z: -213, up: 6, minor: true },
  { text: 'Kolonos hill', x: 350, z: -125, up: 20 },
  { text: 'Greek camp', x: 650, z: -180, up: 8, minor: true },
  { text: 'Alpeni', x: 1900, z: -300, up: 8, minor: true },
  { text: 'Anthela', x: -1100, z: -250, up: 8, minor: true },
  { text: 'Trachis', x: -3050, z: 220, up: 14 },
  { text: 'Persian camp', x: -2950, z: -700, up: 10, minor: true },
  { text: 'Asopos gorge', x: -2480, z: 420, up: 14, minor: true },
  { text: 'Anopaea path', x: -1300, z: 1280, up: 24 },
  { text: 'Phocian post', x: 300, z: 1420, up: 16, minor: true },
]
