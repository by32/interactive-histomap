import { STAGES, type Lighting, type Placement } from './script'

/** Editorial timing compresses the night and morning into one minute. */
export const FILM_CHAPTERS = [
  { time: 0, stage: 6, label: 'Night march', title: 'A way around the gates', caption: 'Ephialtes guides Hydarnes and the Immortals onto the mountain path. Below them, the Greeks still hold the pass.' },
  { time: 12, stage: 6, label: 'The ridge', title: 'Through the oak forest', caption: 'The column marches through the night along Kallidromo. Leonidas has posted 1,000 Phocians to guard the route.' },
  { time: 24, stage: 7, label: 'Dawn', title: 'The Phocians are surprised', caption: 'The Phocians pull back to higher ground. The Immortals pass them and continue downhill toward the Greek rear.' },
  { time: 36, stage: 8, label: 'Withdrawal', title: 'The allies march east', caption: 'News reaches Leonidas: the pass has been turned. Most of the allies leave through Alpeni while the escape route is still open.' },
  { time: 48, stage: 8, label: 'Those who stay', title: 'The defenders remain', caption: 'The Spartans and Thespians stay at the pass; the Thebans also remain. Persian forces are approaching from both directions.' },
] as const

export const LIGHT_KEYS: readonly { time: number; light: Lighting }[] = [
  { time: 0, light: 'night' },
  { time: 16, light: 'night' },
  { time: 28, light: 'dawn' },
  { time: 44, light: 'day' },
  { time: 60, light: 'day' },
]

export interface UnitKeyframe { time: number; units: Record<string, Placement> }
const post = STAGES[6].units
const refuge = STAGES[7].units.phocians
const eastbound = (head: number): Placement => ({ kind: 'coastal-column', head, tail: head - 470, abreast: 12, f: 0.4 })
const mountain = (t0: number, t1: number): Placement => ({ kind: 'column', t0, t1, abreast: 3 })

// Travel between locations is compressed at the chapter cuts. Within a close
// shot, a column advances about 20 m in 12 s, so its stride matches the ground.
export const UNIT_KEYS: readonly UnitKeyframe[] = [
  { time: 0, units: { ...post, immortals: mountain(0.01, 0.22) } },
  { time: 11.999, units: { ...post, immortals: mountain(0.013, 0.223) } },
  { time: 12, units: { ...post, immortals: mountain(0.17, 0.40) } },
  { time: 23.999, units: { ...post, immortals: mountain(0.173, 0.403) } },
  { time: 24, units: { ...post, immortals: mountain(0.40, 0.70) } },
  { time: 35.999, units: { ...post, phocians: refuge, immortals: mountain(0.403, 0.703) } },
  { time: 36, units: { ...post, phocians: refuge, allies: eastbound(1050), immortals: mountain(0.55, 0.83) } },
  { time: 47.999, units: { ...post, phocians: refuge, allies: eastbound(1070), immortals: mountain(0.553, 0.833) } },
  { time: 48, units: { ...post, phocians: refuge, allies: eastbound(2320), immortals: mountain(0.71, 0.99) } },
  { time: 60, units: { ...post, phocians: refuge, allies: eastbound(2340), immortals: mountain(0.713, 0.993) } },
]
