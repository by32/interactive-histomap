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
  setData: (timeline, entities) => set({ timeline, entities }),
  setCurrentFeatures: (currentFeatures) => set({ currentFeatures }),
  setYearIndex: (i) => set({ yearIndex: clampIndex(i, get().timeline) }),
  stepYear: (delta) =>
    set({ yearIndex: clampIndex(get().yearIndex + delta, get().timeline), playing: false }),
  setHovered: (hoveredId) => set({ hoveredId }),
  setSelected: (selectedId) => set({ selectedId }),
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
}))
