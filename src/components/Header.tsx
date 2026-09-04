import SearchBox from './SearchBox'
import { useStore } from '../store'
import { downloadPoster } from '../lib/poster'

export default function Header() {
  const setAboutOpen = useStore((s) => s.setAboutOpen)
  return (
    <header className="header">
      <div className="brand">
        <h1>The Interactive Histomap</h1>
        <span className="tagline">twelve thousand years of territorial history</span>
      </div>
      <SearchBox />
      <a
        className="about-btn walkthrough-link"
        href={`${import.meta.env.BASE_URL}thermopylae.html`}
        target="_blank"
        rel="noreferrer"
        title="Walk the pass of Thermopylae, 480 BC, in 3D"
      >
        ⚔ Thermopylae 3D
      </a>
      <button
        className="about-btn"
        title="Download the full ribbon as a printable wall chart"
        onClick={() => {
          const { timeline, entities } = useStore.getState()
          if (timeline && entities) void downloadPoster(timeline, entities)
        }}
      >
        Poster
      </button>
      <button className="about-btn" onClick={() => setAboutOpen(true)}>
        About & sources
      </button>
    </header>
  )
}
