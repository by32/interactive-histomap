import * as THREE from 'three'
import { UNIT_KEYS } from './film'
import { pathAt } from './units'
import { heightAt, stripZ } from './terrain'
import { interval, smoothstep, clampTime } from './timeline'

/** Five authored shots: tracking, ridge crane, dawn approach, coastal dolly, defenders. */
export class FilmCamera {
  private direction = new THREE.Vector3()

  sample(time: number, position: THREE.Vector3, target: THREE.Vector3) {
    const t = clampTime(time)
    const chapter = Math.min(4, Math.floor(t / 12))
    const u = Math.min(1, (t - chapter * 12) / 12)
    const eased = smoothstep(u)
    const key = interval(UNIT_KEYS, t)
    const from = key.from.units.immortals
    const to = key.to.units.immortals
    const head = from.kind === 'column' && to.kind === 'column'
      ? THREE.MathUtils.lerp(from.t1, to.t1, key.progress) : .3
    if (chapter < 3) {
      // Follow a real part of the column rather than an empty point on the map.
      pathAt(Math.max(0, head - (chapter === 1 ? .10 : .025)), target, this.direction)
      target.y = heightAt(target.x, target.z) + 2.4
      const side = chapter === 0 ? 27 + eased * 18 : chapter === 1 ? 170 + eased * 140 : 60 - eased * 18
      const behind = chapter === 0 ? -23 + eased * 28 : chapter === 1 ? 100 - eased * 180 : 22
      const lift = chapter === 0 ? 11 + eased * 8 : chapter === 1 ? 150 + eased * 110 : 35 - eased * 11
      position.set(target.x - this.direction.z * side + this.direction.x * behind,
        target.y + lift,
        target.z + this.direction.x * side + this.direction.z * behind)
    } else if (chapter === 3) {
      const a = key.from.units.allies, b = key.to.units.allies
      const x = a.kind === 'coastal-column' && b.kind === 'coastal-column'
        ? THREE.MathUtils.lerp(a.head,b.head,key.progress) - 105 : 720 + eased * 210
      const z = stripZ(x,.4)
      target.set(x,heightAt(x,z)+2.5,z)
      position.set(x+34, heightAt(x,z)+23+eased*20,z-70)
    } else {
      const x=-40+eased*10, z=stripZ(x,.5)
      target.set(x,heightAt(x,z)+2,z)
      const distance = 25 + Math.pow(u,3) * 300
      position.set(x-distance, target.y+12+Math.pow(u,3)*155,z-distance*.62)
    }
    const horizontal=Math.hypot(target.x-position.x,target.z-position.z)
    position.y=Math.max(position.y,heightAt(position.x,position.z)+8,target.y+horizontal*.04)
    for(let i=1;i<64;i++) {
      const f=i/64
      const x=THREE.MathUtils.lerp(position.x,target.x,f), z=THREE.MathUtils.lerp(position.z,target.z,f)
      position.y=Math.max(position.y,(heightAt(x,z)+1.3-target.y*f)/(1-f))
    }
  }
}
