import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// MapLibre v6 spawns its worker as a sibling ES module resolved at runtime
// (new URL('./maplibre-gl-worker.mjs', import.meta.url)), which bundlers
// cannot see statically — without help the built site serves index.html for
// the worker request and every GeoJSON source hangs forever. Ship the two
// self-contained dist files at a stable path; MapView points setWorkerUrl
// at them.
const WORKER_FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']
const workerDir = () => path.resolve(import.meta.dirname, 'node_modules/maplibre-gl/dist')

function maplibreWorkerAssets(): Plugin {
  return {
    name: 'maplibre-worker-assets',
    buildStart() {
      for (const file of WORKER_FILES) {
        this.emitFile({
          type: 'asset',
          fileName: `maplibre-worker/${file}`,
          source: fs.readFileSync(path.join(workerDir(), file)),
        })
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = WORKER_FILES.find((f) =>
          req.url?.split('?')[0].endsWith(`/maplibre-worker/${f}`),
        )
        if (!match) return next()
        res.setHeader('Content-Type', 'text/javascript')
        fs.createReadStream(path.join(workerDir(), match)).pipe(res)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/interactive-histomap/',
  plugins: [react(), maplibreWorkerAssets()],
  // MapLibre is ~1 MB minified and needed on first paint; splitting it buys nothing
  build: { chunkSizeWarningLimit: 1400 },
})
