import { create } from 'zustand'
import type { EntityIndex, Timeline, TimeScaleMode, YearFeatureProps } from './types'

interface HistomapState {
  timeline: Timeline | null
  entities: EntityIndex | null
  /** props of every feature in the currently displayed snapshot, by entity id */
  currentFeatures: Map<string, YearFeatureProps> | null
  yearIndex: number
  hoveredId: string | null
  selectedId: string | null
  playing: boolean
  /** dwell per snapshot during playback, ms */
  speedMs: number
  timeScaleMode: TimeScaleMode
  aboutOpen: boolean
  showCities: boolean
  showBattles: boolean
  /** hovered historical city (map) */
  hoveredCity: { n: string; f: number; t?: number; w?: string } | null
  /** hovered event marker (ribbon or map) */
  hoveredEvent: { y: number; t: string; k?: string; w?: string } | null
  /** empire-focus mode: trace the selected polity across its whole history */
  focusOn: boolean
  setData: (timeline: Timeline, entities: EntityIndex) => void
  setCurrentFeatures: (features: Map<string, YearFeatureProps>) => void
  setYearIndex: (i: number) => void
  stepYear: (delta: number) => void
  setHovered: (id: string | null) => void
  setSelected: (id: string | null) => void
  setPlaying: (playing: boolean) => void
  togglePlay: () => void
  cycleSpeed: () => void
  setTimeScaleMode: (mode: TimeScaleMode) => void
  setAboutOpen: (open: boolean) => void
  setShowCities: (show: boolean) => void
  setShowBattles: (show: boolean) => void
  setHoveredCity: (city: HistomapState['hoveredCity']) => void
  setHoveredEvent: (event: HistomapState['hoveredEvent']) => void
  setFocusOn: (on: boolean) => void
}

const clampIndex = (i: number, timeline: Timeline | null) =>
  Math.max(0, Math.min(timeline ? timeline.years.length - 1 : 0, Math.round(i)))

export const useStore = create<HistomapState>((set, get) => ({
  timeline: null,
  entities: null,
  currentFeatures: null,
  yearIndex: 0,
  hoveredId: null,
  selectedId: null,
  playing: false,
  speedMs: 1500,
  timeScaleMode: 'linear',
  aboutOpen: false,
  showCities: true,
  showBattles: true,
  hoveredCity: null,
  hoveredEvent: null,
  focusOn: false,
  setData: (timeline, entities) => set({ timeline, entities }),
  setCurrentFeatures: (currentFeatures) => set({ currentFeatures }),
  setYearIndex: (i) => set({ yearIndex: clampIndex(i, get().timeline) }),
  stepYear: (delta) =>
    set({ yearIndex: clampIndex(get().yearIndex + delta, get().timeline), playing: false }),
  setHovered: (hoveredId) => set({ hoveredId }),
  setSelected: (selectedId) => set({ selectedId, focusOn: false }),
  setPlaying: (playing) => set({ playing }),
  togglePlay: () => {
    const { playing, yearIndex, timeline } = get()
    // restarting play from the final snapshot rewinds to the beginning
    if (!playing && timeline && yearIndex >= timeline.years.length - 1) {
      set({ yearIndex: 0, playing: true })
    } else {
      set({ playing: !playing })
    }
  },
  cycleSpeed: () => {
    const order = [3000, 1500, 700]
    const i = order.indexOf(get().speedMs)
    set({ speedMs: order[(i + 1) % order.length] })
  },
  setTimeScaleMode: (timeScaleMode) => set({ timeScaleMode }),
  setAboutOpen: (aboutOpen) => set({ aboutOpen }),
  setShowCities: (showCities) => set({ showCities }),
  setShowBattles: (showBattles) => set({ showBattles }),
  setHoveredCity: (hoveredCity) => set({ hoveredCity }),
  setHoveredEvent: (hoveredEvent) => set({ hoveredEvent }),
  setFocusOn: (focusOn) => set({ focusOn }),
}))
