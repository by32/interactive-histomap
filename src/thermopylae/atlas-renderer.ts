import * as THREE from 'three'
import { heightAt, modernHeightAt, ANOPAEA_XZ, shoreline } from './terrain'
import { GROUPS } from './script'

/** A functional relief atlas when a device cannot create a WebGL context. */
export class AtlasRenderer {
  outputColorSpace = THREE.SRGBColorSpace
  toneMapping = THREE.ACESFilmicToneMapping
  toneMappingExposure = 1
  private ratio = 1
  private ctx: CanvasRenderingContext2D
  private maps: HTMLCanvasElement[]
  private canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.maps = [this.buildMap(false), this.buildMap(true)]
    document.body.dataset.renderer = 'atlas'
  }
  setPixelRatio(ratio: number) { this.ratio = Math.min(1.5,ratio) }
  getPixelRatio() { return this.ratio }
  setSize(w: number,h: number) { this.canvas.width=w*this.ratio; this.canvas.height=h*this.ratio }

  private buildMap(modern: boolean) {
    const map=document.createElement('canvas'); map.width=660;map.height=420
    const ctx=map.getContext('2d')!, pixels=ctx.createImageData(map.width,map.height)
    const ground=modern?modernHeightAt:heightAt
    for(let j=0;j<map.height;j++) for(let i=0;i<map.width;i++) {
      const x=-3600+i*10,z=-2200+j*10,y=ground(x,z)
      const o=(j*map.width+i)*4
      if(y<0) {
        const d=Math.min(1,-y/45)
        pixels.data.set([32-d*13,92-d*35,96-d*32,255],o)
      } else {
        const dx=ground(x-9,z)-ground(x+9,z), dz=ground(x,z-9)-ground(x,z+9)
        const shade=Math.max(.38,Math.min(1.35,.91+(dx-dz)*.009))
        const high=Math.min(1,y/800)
        const contour=Math.abs(y%50)<3?.82:1
        pixels.data.set([(104+high*70)*shade*contour,(111+high*56)*shade*contour,(77+high*53)*shade*contour,255],o)
      }
    }
    ctx.putImageData(pixels,0,0)
    return map
  }

  render(scene: THREE.Scene,_camera: THREE.Camera) {
    const ctx=this.ctx,w=this.canvas.width/this.ratio,h=this.canvas.height/this.ratio
    ctx.setTransform(this.ratio,0,0,this.ratio,0,0)
    ctx.fillStyle='#122b30';ctx.fillRect(0,0,w,h)
    const scale=Math.max(w/6600,(h-160)/4200)
    const left=(w-6600*scale)/2,top=(h-4200*scale)/2-35
    const px=(x:number)=>left+(x+3600)*scale
    const py=(z:number)=>top+(z+2200)*scale
    ctx.drawImage(this.maps[document.body.dataset.topo==='today'?1:0],left,top,6600*scale,4200*scale)
    ctx.strokeStyle='rgba(238,225,181,.65)';ctx.lineWidth=1.3;ctx.setLineDash([4,6]);ctx.beginPath()
    ANOPAEA_XZ.forEach(([x,z],i)=>i?ctx.lineTo(px(x),py(z)):ctx.moveTo(px(x),py(z)))
    ctx.stroke();ctx.setLineDash([])
    for(const g of GROUPS) {
      const mesh=scene.getObjectByName(g.id) as THREE.InstancedMesh|undefined
      if(!mesh?.count)continue
      const data=mesh.instanceMatrix.array
      ctx.fillStyle='#'+g.color.toString(16).padStart(6,'0')
      for(let i=0;i<mesh.count;i+=2) {
        const o=i*16
        if(data[o]===0&&data[o+5]===0)continue
        ctx.fillRect(px(data[o+12]),py(data[o+14]),Math.max(1.3,scale*5),Math.max(1.3,scale*5))
      }
    }
    ctx.font='italic 17px Georgia';ctx.textAlign='center';ctx.fillStyle='#dce0ca'
    ctx.shadowColor='rgba(0,0,0,.8)';ctx.shadowBlur=5
    for(const [label,x,z] of [['MALIAN GULF',-350,-1450],['Mount Kallidromo',-300,1850],['Anopaea path',-1400,1250],['West Gate',-2000,-220],['Middle Gate',30,shoreline(30)-65],['Alpeni',1950,-200]] as [string,number,number][]) {
      ctx.fillText(label,px(x),py(z))
    }
    ctx.shadowBlur=0
    const shade=ctx.createLinearGradient(0,0,0,h)
    shade.addColorStop(0,'rgba(8,18,22,.3)');shade.addColorStop(.5,'transparent');shade.addColorStop(1,'rgba(8,18,22,.68)')
    ctx.fillStyle=shade;ctx.fillRect(0,0,w,h)
  }
}
