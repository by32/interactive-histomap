import { STAGES, type CameraSpot, type Lighting, type Placement } from './script'

/** Editorial timing compresses the night and morning into one minute. */
export const FILM_CHAPTERS = [
  { time: 0, stage: 6, label: 'Night march', title: 'A way around the gates', caption: 'Ephialtes guides Hydarnes and the Immortals onto the mountain path. Below them, the Greeks still hold the pass.' },
  { time: 12, stage: 6, label: 'The ridge', title: 'Through the oak forest', caption: 'The column marches through the night along Kallidromo. Leonidas has posted 1,000 Phocians to guard the route.' },
  { time: 24, stage: 7, label: 'Dawn', title: 'The Phocians are surprised', caption: 'The Phocians pull back to higher ground. The Immortals pass them and continue downhill toward the Greek rear.' },
  { time: 36, stage: 8, label: 'Withdrawal', title: 'The allies march east', caption: 'News reaches Leonidas: the pass has been turned. Most of the allies leave through Alpeni while the escape route is still open.' },
  { time: 48, stage: 8, label: 'Those who stay', title: 'The defenders remain', caption: 'The Spartans and Thespians stay at the pass; the Thebans also remain. Persian forces are approaching from both directions.' },
] as const

export const CAMERA_KEYS: readonly (CameraSpot & { time: number })[] = [
  { time: 0, pos: [-3200, -900, 800], target: [-2050, 600, 15] },
  { time: 10, pos: [-2350, 650, 200], target: [-1600, 1120, 10] },
  { time: 20, pos: [-800, 1800, 240], target: [-200, 1480, 8] },
  { time: 28, pos: [40, 1870, 210], target: [420, 1420, 12] },
  { time: 34, pos: [1900, 1500, 900], target: [1100, 300, 20] },
  { time: 40, pos: [700, -800, 240], target: [850, -200, 10] },
  { time: 46, pos: [1550, -850, 320], target: [1740, -200, 10] },
  { time: 51, pos: [200, -500, 80], target: [130, -260, 6] },
  { time: 60, pos: [1600, -2600, 2000], target: [450, 350, 60] },
]

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

export const UNIT_KEYS: readonly UnitKeyframe[] = [
  { time: 0, units: { ...post, immortals: mountain(0.01, 0.22) } },
  { time: 12, units: { ...post, immortals: mountain(0.15, 0.39) } },
  { time: 24, units: { ...post, immortals: mountain(0.34, 0.62) } },
  { time: 30, units: { ...post, phocians: refuge, immortals: mountain(0.43, 0.71) } },
  { time: 36, units: { ...post, phocians: refuge, immortals: mountain(0.5, 0.78) } },
  { time: 40, units: { ...post, phocians: refuge, allies: eastbound(1050), immortals: mountain(0.55, 0.83) } },
  { time: 48, units: { ...post, phocians: refuge, allies: eastbound(1980), immortals: mountain(0.62, 0.9) } },
  { time: 60, units: { ...STAGES[8].units, allies: eastbound(2900), immortals: mountain(0.71, 0.99) } },
]
