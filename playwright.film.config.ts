import { defineConfig } from '@playwright/test'

// Pure timeline/geometry checks: no browser or development server required.
export default defineConfig({
  testDir: 'tests',
  testMatch: 'film.unit.ts',
  workers: 1,
})
