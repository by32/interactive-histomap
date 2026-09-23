import { test, expect } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { terrainFingerprint, stageFingerprint } from '../src/thermopylae/fingerprint'
import { STAGES } from '../src/thermopylae/script'

// Assets made in Blender from the scene (scripts/blender/) record the terrain and
// step fingerprints they were made from. The page ignores stale ones, so a stale
// asset is not a visible bug, but it is lost work: these tests say what to redo.

test('the baked terrain textures match the terrain', () => {
  const manifest = JSON.parse(readFileSync('public/thermopylae/terrain/manifest.json', 'utf8'))
  expect(manifest['480bc'].fingerprint, 'run `npm run bake:terrain`').toBe(terrainFingerprint(false))
  expect(manifest.today.fingerprint, 'run `npm run bake:terrain`').toBe(terrainFingerprint(true))
  for (const tag of ['480bc', 'today'])
    for (const file of Object.values(manifest[tag].files) as string[])
      expect(existsSync(`public/thermopylae/terrain/${file}`), file).toBe(true)
})

test('every rendered still matches its step', () => {
  const path = 'public/thermopylae/stills/manifest.json'
  test.skip(!existsSync(path), 'no stills rendered yet')
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  for (const stage of STAGES) {
    const entry = manifest.stages[stage.id]
    expect(entry, `${stage.id}: run \`npm run render:stills && npm run encode:stills\``).toBeTruthy()
    expect(entry.fingerprint, `${stage.id}: its camera, formations or terrain changed; re-render it`).toBe(stageFingerprint(stage))
    for (const file of [...Object.values(entry.avif), ...Object.values(entry.webp)] as string[])
      expect(existsSync(`public/thermopylae/stills/${file}`), file).toBe(true)
  }
})

test('fingerprints are stable and sensitive', () => {
  expect(terrainFingerprint(false)).toMatch(/^[0-9a-f]{8}$/)
  expect(terrainFingerprint(false)).not.toBe(terrainFingerprint(true))
  const a = stageFingerprint(STAGES[2])
  expect(stageFingerprint(STAGES[2])).toBe(a)
  expect(stageFingerprint({ ...STAGES[2], camera: { ...STAGES[2].camera, pos: [0, 0, 1] } })).not.toBe(a)
})
