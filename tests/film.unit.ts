import { test, expect } from '@playwright/test'
import * as THREE from 'three'
import { FilmClock, clampTime } from '../src/thermopylae/timeline'
import { UNIT_KEYS } from '../src/thermopylae/film'
import { Armies, pathAt } from '../src/thermopylae/units'
import { heightAt, cliffFoot, shoreline } from '../src/thermopylae/terrain'
import { STAGES } from '../src/thermopylae/script'

test('the clock pauses, seeks, changes speed and stops at the end', () => {
  const clock = new FilmClock()
  clock.tick(10)
  expect(clock.time).toBe(0)
  clock.play()
  clock.speed = 2
  clock.tick(4)
  expect(clock.time).toBe(8)
  clock.playing = false
  clock.tick(10)
  expect(clock.time).toBe(8)
  clock.seek(59)
  clock.play()
  clock.tick(1)
  expect(clock.time).toBe(60)
  expect(clock.playing).toBe(false)
  clock.play()
  expect(clock.time).toBe(0)
  expect(clampTime(NaN)).toBe(0)
  expect(clampTime(Infinity)).toBe(0)
  expect(clampTime(-10)).toBe(0)
  expect(clampTime(200)).toBe(60)
})

test('rewinding restores identical troop matrices, gait and torches', () => {
  const armies = new Armies()
  armies.prepareFilm(UNIT_KEYS)
  const snapshot = () => armies.root.children.filter((child) => child instanceof THREE.InstancedMesh)
    .map((child) => ({
      name: child.name,
      matrix: Array.from(child.instanceMatrix.array),
      motion: Array.from(child.geometry.getAttribute('motion').array),
    }))
  armies.sampleFilm(27.5)
  const before = snapshot()
  const torchBefore = Array.from(armies.torches.geometry.getAttribute('position').array)
  armies.sampleFilm(59)
  armies.sampleFilm(0)
  armies.sampleFilm(27.5)
  expect(snapshot()).toEqual(before)
  expect(Array.from(armies.torches.geometry.getAttribute('position').array)).toEqual(torchBefore)
})

test('marchers remain on their routes and ground throughout the sequence', () => {
  const armies = new Armies()
  armies.prepareFilm(UNIT_KEYS)
  const immortals = armies.root.getObjectByName('immortals') as THREE.InstancedMesh
  const allies = armies.root.getObjectByName('allies') as THREE.InstancedMesh
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const trail = new THREE.Vector3()
  const landmarks = Array.from({ length: 501 }, (_, i) => { pathAt(i / 500, trail); return trail.clone() })
  for (let second = 0; second <= 60; second += 2) {
    armies.sampleFilm(second)
    for (let i = 0; i < immortals.count; i += 101) {
      immortals.getMatrixAt(i, matrix)
      position.setFromMatrixPosition(matrix)
      expect(Math.abs(position.y - heightAt(position.x, position.z))).toBeLessThan(0.1)
      expect(Math.min(...landmarks.map((p) => Math.hypot(p.x - position.x, p.z - position.z)))).toBeLessThan(15)
    }
    if (second < 40) continue
    for (let i = 0; i < allies.count; i += 37) {
      allies.getMatrixAt(i, matrix)
      position.setFromMatrixPosition(matrix)
      expect(position.z).toBeGreaterThan(shoreline(position.x))
      expect(position.z).toBeLessThan(cliffFoot(position.x))
      expect(Math.abs(position.y - heightAt(position.x, position.z))).toBeLessThan(0.1)
    }
  }
})

test('the original walkthrough can resume after an arbitrary film seek', () => {
  const armies = new Armies()
  armies.prepareFilm(UNIT_KEYS)
  armies.sampleFilm(43)
  armies.setStage(STAGES[8].units, true)
  expect(armies.settled).toBe(true)
  const mesh = armies.root.getObjectByName('spartans') as THREE.InstancedMesh
  const snapshot = Array.from(mesh.instanceMatrix.array)
  const fresh = new Armies()
  fresh.setStage(STAGES[8].units, true)
  const expected = fresh.root.getObjectByName('spartans') as THREE.InstancedMesh
  expect(snapshot).toEqual(Array.from(expected.instanceMatrix.array))
})
