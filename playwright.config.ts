import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests',
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:4173/interactive-histomap/',
    viewport: { width: 1560, height: 940 },
    // software WebGL so MapLibre renders in headless CI containers
    launchOptions: { args: ['--use-angle=swiftshader'] },
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/interactive-histomap/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
