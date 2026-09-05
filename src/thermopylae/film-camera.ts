import * as THREE from 'three'
import { FILM_CHAPTERS, UNIT_KEYS } from './film'
import { pathAt } from './units'
import { heightAt, stripZ } from './terrain'
import { interval, smoothstep, clampTime, FILM_DURATION } from './timeline'

/** Grounded, authored shots for the complete battle, sampled from the shared clock. */
export class FilmCamera {
  private direction = new THREE.Vector3()

  sample(time: number, position: THREE.Vector3, target: THREE.Vector3) {
    const t = clampTime(time)
    const chapter = FILM_CHAPTERS.findLastIndex(c => t >= c.time)
    const shot = FILM_CHAPTERS[chapter]
    const duration = (FILM_CHAPTERS[chapter + 1]?.time ?? FILM_DURATION) - shot.time
    const u = Math.min(1, (t - shot.time) / duration)
    const eased = smoothstep(u)
    const key = interval(UNIT_KEYS, t)
    const from = key.from.units.immortals
    const to = key.to.units.immortals
    const head = from.kind === 'column' && to.kind === 'column'
      ? THREE.MathUtils.lerp(from.t1, to.t1, key.progress) : .3
    if (shot.id === 'gates') {
      const z = stripZ(-60,.5)
      target.set(-60,heightAt(-60,z)+3,z)
      position.set(-680+eased*320,430-eased*235,z-850+eased*430)
    } else if (shot.id === 'medes' || shot.id === 'immortals' || shot.id === 'day-two') {
      const x = shot.id === 'immortals' ? -122+Math.sin(u*Math.PI)*12 : -124
      const z = stripZ(x,.5)
      target.set(x,heightAt(x,z)+2.2,z)
      position.set(x-24+eased*42,target.y+16+eased*9,z-42-eased*12)
    } else if (chapter >= 4 && chapter <= 6) {
      const mountainShot = chapter - 4
      // Follow a real part of the column rather than an empty point on the map.
      pathAt(Math.max(0, head - (mountainShot === 1 ? .10 : .025)), target, this.direction)
      target.y = heightAt(target.x, target.z) + 2.4
      const side = mountainShot === 0 ? 27 + eased * 18 : mountainShot === 1 ? 170 + eased * 140 : 60 - eased * 18
      const behind = mountainShot === 0 ? -23 + eased * 28 : mountainShot === 1 ? 100 - eased * 180 : 22
      const lift = mountainShot === 0 ? 11 + eased * 8 : mountainShot === 1 ? 150 + eased * 110 : 35 - eased * 11
      position.set(target.x - this.direction.z * side + this.direction.x * behind,
        target.y + lift,
        target.z + this.direction.x * side + this.direction.z * behind)
    } else if (shot.id === 'withdrawal') {
      const a = key.from.units.allies, b = key.to.units.allies
      const x = a.kind === 'coastal-column' && b.kind === 'coastal-column'
        ? THREE.MathUtils.lerp(a.head,b.head,key.progress) - 105 : 720 + eased * 210
      const z = stripZ(x,.4)
      target.set(x,heightAt(x,z)+2.5,z)
      position.set(x+34, heightAt(x,z)+23+eased*20,z-70)
    } else if (shot.id === 'stay') {
      const x=-40+eased*10, z=stripZ(x,.5)
      target.set(x,heightAt(x,z)+2,z)
      const distance = 25 + Math.pow(u,3) * 300
      position.set(x-distance, target.y+12+Math.pow(u,3)*155,z-distance*.62)
    } else if (shot.id === 'advance' || shot.id === 'leonidas') {
      const a=key.from.units.spartans, b=key.to.units.spartans
      const x=a.kind==='block' && b.kind==='block' ? THREE.MathUtils.lerp(a.x,b.x,key.progress)-8 : -337
      const close=shot.id==='leonidas'
      const z=stripZ(x,close?.40:.55)
      target.set(x,heightAt(x,z)+2,z)
      position.set(x-26+eased*38,target.y+(close?12:23)+eased*8,z-(close?30:64))
    } else if (shot.id === 'kolonos') {
      const x=325+eased*25,z=-125
      target.set(x,heightAt(x,z)+2,z)
      position.set(x-78+eased*30,target.y+48+eased*40,z-140-eased*35)
    } else if (shot.id === 'missiles') {
      target.set(350,heightAt(350,-125)+2,-125)
      position.set(350-55+eased*105,target.y+34+eased*40,-220-eased*50)
    } else {
      target.set(350,heightAt(350,-125)+2,-125)
      position.set(430+eased*700,target.y+75+eased*690,-340-eased*1150)
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
