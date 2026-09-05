import { test, expect } from '@playwright/test'
import * as THREE from 'three'
import { FilmClock, clampTime, FILM_DURATION } from '../src/thermopylae/timeline'
import { UNIT_KEYS, FILM_CHAPTERS } from '../src/thermopylae/film'
import { FilmCamera } from '../src/thermopylae/film-camera'
import { Armies, pathAt } from '../src/thermopylae/units'
import { heightAt, cliffFoot, shoreline } from '../src/thermopylae/terrain'
import { BattleEffects, battlePose } from '../src/thermopylae/battle'
import { STAGES } from '../src/thermopylae/script'

test('camera focal points and sightlines remain above the terrain between shots', () => {
  const path = new FilmCamera()
  const eye = new THREE.Vector3()
  const target = new THREE.Vector3()
  const ray = new THREE.Vector3()
  for (let time = 0; time <= FILM_DURATION; time += 0.25) {
    path.sample(time, eye, target)
    expect(target.y).toBeGreaterThan(heightAt(target.x, target.z))
    expect(eye.y).toBeGreaterThan(heightAt(eye.x, eye.z))
    expect(eye.distanceTo(target)).toBeLessThan(9000)
    for (let i = 1; i < 31; i++) {
      ray.lerpVectors(eye, target, i / 31)
      expect(ray.y, `sightline at ${time}s, segment ${i}`).toBeGreaterThan(heightAt(ray.x, ray.z))
    }
  }
  path.sample(27, eye, target)
  const before = [eye.clone(), target.clone()]
  path.sample(59, eye, target)
  path.sample(27, eye, target)
  expect([eye, target]).toEqual(before)
})

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
  clock.seek(FILM_DURATION-1)
  clock.play()
  clock.tick(1)
  expect(clock.time).toBe(FILM_DURATION)
  expect(clock.playing).toBe(false)
  clock.play()
  expect(clock.time).toBe(0)
  expect(clampTime(NaN)).toBe(0)
  expect(clampTime(Infinity)).toBe(0)
  expect(clampTime(-10)).toBe(0)
  expect(clampTime(200)).toBe(FILM_DURATION)
})

test('rewinding restores identical troop matrices, gait and torches', () => {
  const armies = new Armies()
  armies.prepareFilm(UNIT_KEYS)
  const snapshot = () => armies.root.children.filter((child) => child instanceof THREE.InstancedMesh)
    .map((child) => ({
      name: child.name,
      matrix: Array.from(child.instanceMatrix.array),
      motion: Array.from(child.geometry.getAttribute('motion').array),
      battle: Array.from(child.geometry.getAttribute('battle').array),
    }))
  armies.sampleFilm(168.5)
  const before = snapshot()
  const torchBefore = Array.from(armies.torches.geometry.getAttribute('position').array)
  armies.sampleFilm(192)
  armies.sampleFilm(0)
  armies.sampleFilm(168.5)
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
  for (let second = 60; second < 120; second += 2) {
    armies.sampleFilm(second)
    for (let i = 0; i < immortals.count; i += 101) {
      immortals.getMatrixAt(i, matrix)
      position.setFromMatrixPosition(matrix)
      expect(Math.abs(position.y - heightAt(position.x, position.z))).toBeLessThan(0.1)
      expect(Math.min(...landmarks.map((p) => Math.hypot(p.x - position.x, p.z - position.z)))).toBeLessThan(15)
    }
    if (second < 96) continue
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
  armies.sampleFilm(151)
  armies.setStage(STAGES[8].units, true)
  expect(armies.settled).toBe(true)
  const mesh = armies.root.getObjectByName('spartans') as THREE.InstancedMesh
  const snapshot = Array.from(mesh.instanceMatrix.array)
  const fresh = new Armies()
  fresh.setStage(STAGES[8].units, true)
  const expected = fresh.root.getObjectByName('spartans') as THREE.InstancedMesh
  expect(snapshot).toEqual(Array.from(expected.instanceMatrix.array))
})

test('detailed soldiers replace nearby figures without losing them when the camera leaves', () => {
  const armies = new Armies()
  armies.prepareFilm(UNIT_KEYS)
  armies.sampleFilm(65)
  const mesh=armies.root.getObjectByName('immortals') as THREE.InstancedMesh
  const detail=armies.root.getObjectByName('immortals-detail') as THREE.InstancedMesh
  const original=Array.from(mesh.instanceMatrix.array)
  const matrix=new THREE.Matrix4()
  mesh.getMatrixAt(0,matrix)
  const eye=new THREE.Vector3().setFromMatrixPosition(matrix).add(new THREE.Vector3(10,12,10))
  armies.updateDetail(eye)
  expect(detail.count).toBeGreaterThan(0)
  expect(detail.count).toBeLessThanOrEqual(96)
  for(let i=0;i<detail.count;i++) {
    detail.getMatrixAt(i,matrix)
    expect(new THREE.Vector3().setFromMatrixPosition(matrix).distanceTo(eye)).toBeLessThan(320)
  }
  armies.updateDetail(new THREE.Vector3(20000,20000,20000))
  expect(detail.count).toBe(0)
  expect(Array.from(mesh.instanceMatrix.array)).toEqual(original)
})

test('close-shot marching covers human walking distances between editorial cuts', () => {
  const armies=new Armies()
  armies.prepareFilm(UNIT_KEYS)
  const mesh=armies.root.getObjectByName('immortals') as THREE.InstancedMesh
  const m=new THREE.Matrix4(), before=new THREE.Vector3(), after=new THREE.Vector3()
  for(const start of [60,72,84]) {
    armies.sampleFilm(start);mesh.getMatrixAt(0,m);before.setFromMatrixPosition(m)
    armies.sampleFilm(start+10);mesh.getMatrixAt(0,m);after.setFromMatrixPosition(m)
    expect(after.distanceTo(before)).toBeGreaterThan(5)
    expect(after.distanceTo(before)).toBeLessThan(30)
  }
})

test('the complete battle is chronological and the last defenders fall before the aftermath', () => {
  expect(FILM_CHAPTERS[0].time).toBe(0)
  expect(FILM_CHAPTERS.map(c=>c.id)).toEqual(['gates','medes','immortals','day-two','night','ridge','dawn','withdrawal','stay','advance','leonidas','kolonos','missiles','aftermath'])
  expect(UNIT_KEYS.at(-1)!.time).toBe(FILM_DURATION)
  for(let i=1;i<UNIT_KEYS.length;i++)expect(UNIT_KEYS[i].time).toBeGreaterThan(UNIT_KEYS[i-1].time)
  const pose=new THREE.Vector4()
  expect(battlePose(24,'spartans',0,-119,pose).x).toBeGreaterThan(.9)
  expect(battlePose(66,'spartans',0,-40,pose).x).toBe(0)
  expect(battlePose(155,'thebans',0,465,pose).z).toBe(1)
  for(const id of ['spartans','thespians'])for(let i=0;i<140;i++) {
    expect(battlePose(176,id,i,350,pose).y).toBe(1)
    expect(battlePose(108,id,i,-40,pose).y).toBe(0)
  }
})

test('missile volleys are deterministic, limited to documented scenes and cleared on exit', () => {
  const effects=new BattleEffects()
  effects.sample(168,true)
  expect(effects.arrows.count).toBeGreaterThan(0)
  const before=Array.from(effects.arrows.instanceMatrix.array)
  effects.sample(170,true)
  effects.sample(168,true)
  expect(Array.from(effects.arrows.instanceMatrix.array)).toEqual(before)
  effects.sample(20,true)
  expect(effects.arrows.count).toBe(0)
  effects.sample(168,false)
  expect(effects.root.visible).toBe(false)
})

test('final-stand defenders face outward and both encircling armies remain on land', () => {
  const armies=new Armies();armies.prepareFilm(UNIT_KEYS);armies.sampleFilm(164)
  const m=new THREE.Matrix4(),p=new THREE.Vector3(),f=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3()
  for(const id of ['spartans','thespians','host','immortals']) {
    const mesh=armies.root.getObjectByName(id) as THREE.InstancedMesh
    for(let i=0;i<mesh.count;i+=7) {
      mesh.getMatrixAt(i,m);m.decompose(p,q,s)
      expect(p.y).toBeGreaterThanOrEqual(0)
      if(id==='spartans'||id==='thespians') {
        f.set(0,0,1).applyQuaternion(q)
        expect(f.x*(p.x-350)+f.z*(p.z+125)).toBeGreaterThan(0)
      }
    }
  }
})
