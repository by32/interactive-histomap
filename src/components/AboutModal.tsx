import { useStore } from '../store'

export default function AboutModal() {
  const open = useStore((s) => s.aboutOpen)
  const setAboutOpen = useStore((s) => s.setAboutOpen)
  if (!open) return null
  return (
    <div className="modal-backdrop" onClick={() => setAboutOpen(false)}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="About and sources"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="close-btn" onClick={() => setAboutOpen(false)} aria-label="Close">
          ×
        </button>
        <h2>About this map</h2>
        <p>
          A modern, interactive homage to John B. Sparks&rsquo;{' '}
          <a
            href="https://www.davidrumsey.com/luna/servlet/s/0kkg0q"
            target="_blank"
            rel="noreferrer"
          >
            <em>Histomap</em> (Rand&nbsp;McNally, 1931)
          </a>
          &nbsp;&mdash; the five-foot chart of &ldquo;four thousand years of world history.&rdquo;
          Sparks sized each civilization&rsquo;s band by an undefined feeling of &ldquo;relative
          power.&rdquo; This version replaces that judgment with something measurable:{' '}
          <strong>territorial extent</strong>, computed from open historical border data, on a real
          map you can scrub through time.
        </p>

        <h3>How the ribbon is computed</h3>
        <ul>
          <li>
            Each stream&rsquo;s width is its <strong>share of all land held by organized
            polities</strong> in that snapshot &mdash; states, empires, khanates, caliphates,
            confederations. Areas are geodesic, computed from the source borders before any
            simplification.
          </li>
          <li>
            Broad <strong>cultural and tribal areas</strong> (hunter-gatherer zones,
            archaeological cultures, &ldquo;&hellip;tribes&rdquo;) still render on the map in
            parchment tones, but are excluded from the ribbon and its denominator &mdash;
            otherwise antiquity would be a wall of gray. Which side of that line a society falls
            on is a judgment call; ours is documented in the repository&rsquo;s curation table.
          </li>
          <li>
            Streams are grouped into <strong>civilization families</strong> echoing the 1931
            original (one hue per family, shade variants per polity). About 180 polities are
            named streams &mdash; every polity that ever held &ge;1.5% of state land, plus a
            curated canon of pivotal smaller states (France, Britain, Japan, the Aztecs&hellip;)
            that a pure area cut would bury; the rest aggregate into &ldquo;Other states.&rdquo;
          </li>
          <li>
            Territorial extent is not power. Ming China mattered more than its area suggests;
            the Mongol khanates less, per km², than Rome. The original&rsquo;s subjectivity is
            the thing being replaced &mdash; but no single number captures &ldquo;power.&rdquo;
          </li>
        </ul>

        <h3>Accuracy, honestly stated</h3>
        <ul>
          <li>
            Borders come from{' '}
            <a
              href="https://github.com/aourednik/historical-basemaps"
              target="_blank"
              rel="noreferrer"
            >
              historical-basemaps
            </a>{' '}
            by André Ourednik (GPL-3.0), a scholarly open dataset of world political boundaries
            at 52 snapshot years from 10,000&nbsp;BC to 2010&nbsp;AD. It is the best openly
            licensed data of its scope &mdash; and still a set of approximations.
          </li>
          <li>
            <strong>Dashed borders mean approximate borders.</strong> The dataset rates each
            border&rsquo;s precision; before about 1650 nearly everything is an approximate zone
            (loose dashes), while modern borders are treaty-defined (solid lines). Before the
            modern state, a frontier was usually a gradient, not a line.
          </li>
          <li>
            Snapshots are unevenly spaced (millennia apart in prehistory, 10&ndash;20 years in
            the 20th century). The axis defaults to <strong>true linear time</strong> with one
            marked exception: the deep-time segment before 4000&nbsp;BC &mdash; a forager world
            with no states to measure &mdash; is compressed behind an axis break so recorded
            history keeps its proportions. The &ldquo;compressed&rdquo; toggle gives every
            snapshot equal space instead. Between snapshots the streams are interpolated for
            legibility &mdash; only the 52 snapshot years are data.
          </li>
          <li>
            Overlapping claims and suzerain&ndash;vassal relationships are flattened so land is
            counted once. A handful of clear-cut upstream labeling errors are patched by a
            documented corrections file; everything we found, checked, fixed, or chose not to
            fix is logged in the repository&rsquo;s <strong>ERRATA.md</strong>.
          </li>
          <li>
            The event notes along the ribbon, the battle markers, and the historical-city
            dots are curated: conventional dates and traditional sites from common reference
            works, with the full lists and policy in the repository. Each battle appears on
            the map at the snapshot nearest its year.
          </li>
          <li>
            Treat all of it as a visual aid for the shape of history, not a citable reference
            for any particular border.
          </li>
        </ul>

        <h3>Sources & code</h3>
        <p>
          Border data:{' '}
          <a
            href="https://github.com/aourednik/historical-basemaps"
            target="_blank"
            rel="noreferrer"
          >
            aourednik/historical-basemaps
          </a>{' '}
          (GPL-3.0). This project&rsquo;s code, curation tables, corrections, and errata:{' '}
          <a
            href="https://github.com/by32/interactive-histomap"
            target="_blank"
            rel="noreferrer"
          >
            by32/interactive-histomap
          </a>{' '}
          (GPL-3.0). Inspired by the original <em>Histomap</em>, John B. Sparks, 1931.
        </p>
      </div>
    </div>
  )
}
