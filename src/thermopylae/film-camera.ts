import * as THREE from 'three'
import { CAMERA_KEYS } from './film'
import { heightAt } from './terrain'
import { interval, smoothstep } from './timeline'

/** A seekable camera path whose focus and sightline follow the terrain. */
export class FilmCamera {
  private positions = new THREE.CatmullRomCurve3(CAMERA_KEYS.map(({ pos: [x, z, up] }) =>
    new THREE.Vector3(x, heightAt(x, z) + up, z)), false, 'centripetal')
  private targets = new THREE.CatmullRomCurve3(CAMERA_KEYS.map(({ target: [x, z] }) =>
    new THREE.Vector3(x, 0, z)), false, 'centripetal')

  sample(time: number, position: THREE.Vector3, target: THREE.Vector3) {
    const shot = interval(CAMERA_KEYS, time)
    const fraction = (shot.index + shot.progress) / (CAMERA_KEYS.length - 1)
    this.positions.getPoint(fraction, position)
    this.targets.getPoint(fraction, target)
    const up = THREE.MathUtils.lerp(shot.from.target[2], shot.to.target[2], smoothstep(shot.progress))
    target.y = heightAt(target.x, target.z) + up
    const horizontal = Math.hypot(target.x - position.x, target.z - position.z)
    // Also respect OrbitControls' near-horizontal angle limit without moving the eye sideways.
    position.y = Math.max(position.y, heightAt(position.x, position.z) + 25, target.y + horizontal * 0.04)
    // Lift the eye when an intervening ridge hides the intended focus. All calculations
    // depend only on time, so seeking to a shot restores exactly the same camera.
    for (let i = 1; i < 48; i++) {
      const t = i / 48
      const x = THREE.MathUtils.lerp(position.x, target.x, t)
      const z = THREE.MathUtils.lerp(position.z, target.z, t)
      const requiredHeight = (heightAt(x, z) + 6 - target.y * t) / (1 - t)
      position.y = Math.max(position.y, requiredHeight)
    }
  }
}
