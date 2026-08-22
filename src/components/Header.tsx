import SearchBox from './SearchBox'
import { useStore } from '../store'

export default function Header() {
  const setAboutOpen = useStore((s) => s.setAboutOpen)
  return (
    <header className="header">
      <div className="brand">
        <h1>The Interactive Histomap</h1>
        <span className="tagline">four thousand years of territorial history</span>
      </div>
      <SearchBox />
      <button className="about-btn" onClick={() => setAboutOpen(true)}>
        About & sources
      </button>
    </header>
  )
}
