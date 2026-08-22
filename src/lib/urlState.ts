import { useStore } from '../store'

/** apply #y=<year>&e=<entityId> once after boot data is in the store */
export function initUrlState(): void {
  const params = new URLSearchParams(location.hash.slice(1))
  const y = params.get('y')
  const e = params.get('e')
  const { timeline, entities, setYearIndex, setSelected } = useStore.getState()
  if (timeline && y !== null) {
    const idx = timeline.years.indexOf(Number(y))
    if (idx >= 0) setYearIndex(idx)
  }
  if (e && entities?.[e]) setSelected(e)
}

/** keep the hash in sync (debounced) so any moment is shareable */
export function syncUrlState(): () => void {
  let timer: number | undefined
  return useStore.subscribe((state, prev) => {
    if (state.yearIndex === prev.yearIndex && state.selectedId === prev.selectedId) return
    clearTimeout(timer)
    timer = window.setTimeout(() => {
      const { timeline, yearIndex, selectedId } = useStore.getState()
      if (!timeline) return
      const params = new URLSearchParams()
      params.set('y', String(timeline.years[yearIndex]))
      if (selectedId) params.set('e', selectedId)
      history.replaceState(null, '', `#${params.toString()}`)
    }, 250)
  })
}
