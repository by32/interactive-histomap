import * as THREE from 'three'
import { heightAt } from './terrain'
import { smoothstep } from './timeline'

const ramp = (start: number, end: number, t: number) => smoothstep(THREE.MathUtils.clamp((t-start)/(end-start),0,1))
const hash = (i: number) => { const x=Math.sin(i*127.1+311.7)*43758.5453;return x-Math.floor(x) }

/** Schematic combat, never a claim to exact casualties or individual movements.
 * x = engagement, y = fall, z = surrender, w = broken spear / drawn sword.
 * No integration, random calls or mutable death state: seeking restores everything.
 */
export function battlePose(time: number, id: string, i: number, x: number, out: THREE.Vector4) {
  out.set(0,0,0,0)
  const greek = id==='spartans'||id==='thespians'
  if (time>=16 && time<32 && (id==='spartans'||id==='medes')) {
    out.x=ramp(20,23,time)*(1-ramp(27,31,time))*(Math.abs(x+122)<13?1:0)
  } else if(time>=32 && time<48 && (id==='spartans'||id==='immortals')) {
    out.x=(time<35?1:time>=41?1-ramp(44,48,time):0)*(Math.abs(x+113)<18?1:0)
  } else if(time>=48 && time<60 && (id==='thespians'||id==='medes')) {
    out.x=ramp(49,53,time)*(1-ramp(56,60,time))*(Math.abs(x+126)<16?1:0)
  }
  if(time>=120 && time<148 && (greek||id==='host')) {
    out.x= Math.abs(x+338)<22 ? ramp(120,124,time) : 0
    if(greek) {
      out.w=ramp(133,139,time)
      if(hash(i+13)<.22)out.y=ramp(137+hash(i+31)*5,139+hash(i+31)*5,time)
    }
  }
  if(time>=148 && greek) {
    out.x=time<164?.25:0
    out.w=1
    // A smaller surviving group reaches the mound; the last volley ends it.
    const fallAt=hash(i+13)<.22?145:165.5+hash(i+41)*8
    out.y=ramp(fallAt,fallAt+1.6,time)
  }
  if(time>=148 && id==='thebans')out.z=ramp(148,152,time)
  if(time>=176 && greek)out.y=1
  out.x*=1-out.y
  return out
}

/** Sparse arrow shafts follow ballistic arcs; the diagram does not invent a
 * sky-blackening opening volley or turn the whole final army into archers.
 */
export class BattleEffects {
  readonly root = new THREE.Group()
  readonly arrows: THREE.InstancedMesh
  private matrix = new THREE.Matrix4()
  private rotation = new THREE.Quaternion()
  private position = new THREE.Vector3()
  private direction = new THREE.Vector3()
  private up = new THREE.Vector3(0,1,0)
  private scale = new THREE.Vector3(1,1,1)

  constructor() {
    this.root.name='battle-effects'
    const shaft=new THREE.CylinderGeometry(.024,.024,1.7,3)
    this.arrows=new THREE.InstancedMesh(shaft,new THREE.MeshBasicMaterial({color:0xc7b996}),180)
    this.arrows.frustumCulled=false
    this.arrows.name='battle-arrows'
    this.arrows.count=0
    this.root.add(this.arrows)
  }

  sample(time: number, active: boolean) {
    const dawn=time>=86&&time<92
    const final=time>=164&&time<175.5
    this.root.visible=active&&(dawn||final)
    this.arrows.count=0
    if(!this.root.visible)return
    const start=dawn?86:164
    const duration=dawn?2:2.5
    for(let i=0;i<180;i++) {
      const elapsed=time-start-hash(i+4)*1.8
      if(elapsed<0)continue
      const u=(elapsed%duration)/duration
      const angle=hash(i+9)*Math.PI*2
      const radius=10+hash(i+12)*20
      const tx=dawn?365+hash(i+27)*70:350+Math.cos(angle)*radius
      const tz=dawn?1520+hash(i+22)*30:-125+Math.sin(angle)*radius
      const sx=dawn?280:350+(i%2?-1:1)*(90+hash(i+51)*50)
      const sz=dawn?1430:-135+(hash(i+75)-.5)*80
      const sy=heightAt(sx,sz)+2.7,ty=heightAt(tx,tz)+.6
      const arc=dawn?25:34
      this.position.set(THREE.MathUtils.lerp(sx,tx,u),THREE.MathUtils.lerp(sy,ty,u)+4*arc*u*(1-u),THREE.MathUtils.lerp(sz,tz,u))
      this.direction.set(tx-sx,ty-sy+4*arc*(1-2*u),tz-sz).normalize()
      this.rotation.setFromUnitVectors(this.up,this.direction)
      this.matrix.compose(this.position,this.rotation,this.scale)
      this.arrows.setMatrixAt(this.arrows.count++,this.matrix)
    }
    this.arrows.instanceMatrix.needsUpdate=true
  }
}
