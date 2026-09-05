import { STAGES, type Lighting, type Placement } from './script'
import { FILM_DURATION } from './timeline'

/** Chapter cuts compress historical time; movement within shots stays human-scale. */
export const FILM_CHAPTERS = [
  { id: 'gates', time: 0, stage: 2, label: 'The gates', title: 'An army holds the narrow road', caption: 'A Greek coalition under Leonidas guards the rebuilt Phocian wall. The mountain and the Malian Gulf funnel the much larger Persian army into a narrow front.', source: '7.176' },
  { id: 'medes', time: 16, stage: 3, label: 'First assault', title: 'The first assault meets the phalanx', caption: 'The Medes and Cissians attack. The Greek line holds the passage; fresh attackers replace those who fall. Fighting lasts through the day.', source: '7.210' },
  { id: 'immortals', time: 32, stage: 4, label: 'The Immortals', title: 'The royal troops cannot break through', caption: 'Hydarnes brings up the Immortals. Their numbers cannot spread out in the pass. Herodotus describes Spartan feigned retreats followed by sudden turns against the pursuing troops.', source: '7.211' },
  { id: 'day-two', time: 48, stage: 5, label: 'Day two', title: 'Fresh contingents take their turn', caption: 'The Persian assaults resume. Greek contingents fight in rotation, while the Phocians guard the mountain. The road remains closed for a second day.', source: '7.212' },
  { id: 'night', time: 60, stage: 6, label: 'Night march', title: 'A way around the gates', caption: 'Ephialtes guides Hydarnes and the Immortals onto the mountain path. Below them, the Greeks still hold the pass.', source: '7.215' },
  { id: 'ridge', time: 72, stage: 6, label: 'The ridge', title: 'Through the oak forest', caption: 'The column marches through the night along Kallidromo. Leonidas has posted 1,000 Phocians to guard the route.', source: '7.217' },
  { id: 'dawn', time: 84, stage: 7, label: 'Dawn', title: 'The Phocians are surprised', caption: 'Arrows force the Phocians back to higher ground. The Immortals bypass them and continue downhill toward the Greek rear.', source: '7.218' },
  { id: 'withdrawal', time: 96, stage: 8, label: 'Withdrawal', title: 'Most of the allies leave', caption: 'Deserters and lookouts bring the warning: the pass has been turned. After a divided council, most allies withdraw. Herodotus favours the account that Leonidas sent them away.', source: '7.220' },
  { id: 'stay', time: 108, stage: 8, label: 'Those who stay', title: 'The Thespians stay with the Spartans', caption: 'Demophilus and the Thespians choose to remain. The Thebans also stay; Herodotus calls them hostages. Their motives are known through his account, not their own testimony.', source: '7.222' },
  { id: 'advance', time: 120, stage: 9, label: 'Final assault', title: 'Out beyond the narrows', caption: 'On the third morning Xerxes renews the attack. The remaining Greeks advance into the broader ground west of the wall and meet the Persian front.', source: '7.223' },
  { id: 'leonidas', time: 136, stage: 9, label: 'Leonidas falls', title: 'The struggle for the fallen king', caption: 'Leonidas is killed in the fighting. With many spears broken, the Greeks fight with swords. They recover his body and repeatedly drive back the attackers.', source: '7.224' },
  { id: 'kolonos', time: 148, stage: 9, label: 'Kolonos', title: 'The surviving defenders pull back', caption: 'As the mountain force arrives, the Spartans and Thespians retreat behind the wall to the hillock. The Thebans separate from them and surrender, according to Herodotus.', source: '7.233' },
  { id: 'missiles', time: 164, stage: 9, label: 'The last stand', title: 'The hill is surrounded', caption: 'Persian forces close in from both directions. The remaining Greeks make their stand together on the mound, where the ancient account says they are overwhelmed by missiles.', source: '7.225' },
  { id: 'aftermath', time: 176, stage: 10, label: 'Aftermath', title: 'The pass is open', caption: 'Persia has won the battle. News of Leonidas’s defeat reaches the Greek fleet at Artemisium, and it withdraws. The invasion continues; the wider war is not yet decided.', source: '8.21' },
] as const

export const LIGHT_KEYS: readonly { time: number; light: Lighting }[] = [
  { time: 0, light: 'day' }, { time: 59.999, light: 'day' },
  { time: 60, light: 'night' }, { time: 76, light: 'night' },
  { time: 88, light: 'dawn' }, { time: 104, light: 'day' },
  { time: 176, light: 'day' }, { time: FILM_DURATION, light: 'dusk' },
]

export interface UnitKeyframe { time: number; units: Record<string, Placement> }
const WEST = -Math.PI / 2, EAST = Math.PI / 2
const hidden: Placement = { kind: 'hidden' }
const post = STAGES[6].units
const refuge = STAGES[7].units.phocians
const block = (x: number, heading: number, cols: number, f = .5): Placement => ({ kind: 'block', x, f, heading, cols, spacing: 2.4 })
const eastbound = (head: number): Placement => ({ kind: 'coastal-column', head, tail: head - 470, abreast: 12, f: .4 })
const mountain = (t0: number, t1: number): Placement => ({ kind: 'column', t0, t1, abreast: 3 })
const departed = { ...post, allies: hidden, phocians: refuge }

// Front ranks, not block centres, meet. Persian blocks are much deeper;
// placing both centres at the contact line would overlap the armies.
const dayOne = (persianX: number, greekX = -110, heading = WEST) => ({ ...STAGES[3].units, spartans: block(greekX, heading, 8), medes: block(persianX, EAST, 20) })
const royal = (persianX: number, greekX: number, heading = WEST) => ({ ...STAGES[4].units, spartans: block(greekX, heading, 8), immortals: block(persianX, EAST, 20) })
const dayTwo = (persianX: number) => ({ ...STAGES[5].units, thespians: block(-110, WEST, 12), medes: block(persianX, EAST, 20) })
const advance = (x: number, enemy: number) => ({ ...departed, spartans: block(x, WEST, 8, .40), thespians: block(x + 5, WEST, 12, .69), thebans: block(x + 52, WEST, 8), host: block(enemy, EAST, 42), immortals: mountain(.75,.997) })
const mound = (x: number, radius: number): Record<string, Placement> => ({
  ...departed,
  spartans: { kind: 'ring', x, z: -125, rMin: 0, rMax: radius * .65, facing: 'out' },
  thespians: { kind: 'ring', x, z: -125, rMin: radius * .45, rMax: radius, facing: 'out' },
  thebans: { kind: 'block', x: 465, z: -195, heading: EAST, cols: 8 },
  host: { kind: 'ring', x: 350, z: -125, rMin: 80, rMax: 250, startAngle: Math.PI * .52, endAngle: Math.PI * 1.48 },
  medes: block(-340, EAST, 30),
  immortals: { kind: 'ring', x: 350, z: -125, rMin: 80, rMax: 190, startAngle: -Math.PI * .48, endAngle: Math.PI * .48 },
})

export const UNIT_KEYS: readonly UnitKeyframe[] = [
  { time: 0, units: STAGES[2].units }, { time: 15.999, units: STAGES[2].units },
  { time: 16, units: dayOne(-257) }, { time: 23, units: dayOne(-244) },
  { time: 26, units: dayOne(-244) }, { time: 31.999, units: dayOne(-256) },
  { time: 32, units: royal(-244,-110) }, { time: 36, units: royal(-238,-104,EAST) },
  { time: 40, units: royal(-232,-98,EAST) }, { time: 41, units: royal(-232,-98) },
  { time: 44, units: royal(-236,-102) }, { time: 47.999, units: royal(-243,-105) },
  { time: 48, units: dayTwo(-260) }, { time: 53, units: dayTwo(-248) },
  { time: 55, units: dayTwo(-248) }, { time: 59.999, units: dayTwo(-259) },
  { time: 60, units: { ...post, immortals: mountain(.01,.22) } },
  { time: 71.999, units: { ...post, immortals: mountain(.013,.223) } },
  { time: 72, units: { ...post, immortals: mountain(.17,.40) } },
  { time: 83.999, units: { ...post, immortals: mountain(.173,.403) } },
  { time: 84, units: { ...post, immortals: mountain(.40,.70) } },
  { time: 95.999, units: { ...post, phocians: refuge, immortals: mountain(.403,.703) } },
  { time: 96, units: { ...post, phocians: refuge, allies: eastbound(1050), immortals: mountain(.55,.83) } },
  { time: 107.999, units: { ...post, phocians: refuge, allies: eastbound(1070), immortals: mountain(.553,.833) } },
  { time: 108, units: { ...post, phocians: refuge, allies: eastbound(2320), immortals: mountain(.71,.99) } },
  { time: 119.999, units: { ...post, phocians: refuge, allies: eastbound(2340), immortals: mountain(.713,.993) } },
  { time: 120, units: advance(-318,-505) }, { time: 126, units: advance(-327,-514) },
  { time: 135.999, units: advance(-330,-517) },
  { time: 136, units: advance(-330,-517) }, { time: 140, units: advance(-330,-517) },
  { time: 144, units: advance(-333,-524) }, { time: 147.999, units: advance(-330,-522) },
  { time: 148, units: mound(325,37) }, { time: 163.999, units: mound(350,32) },
  { time: 164, units: mound(350,32) }, { time: 175.999, units: mound(350,32) },
  { time: 176, units: { ...mound(350,32), phocians: hidden, medes: hidden, host: eastbound(750), immortals: eastbound(1520) } },
  { time: FILM_DURATION, units: { ...mound(350,32), phocians: hidden, medes: hidden, host: eastbound(774), immortals: eastbound(1544) } },
]
