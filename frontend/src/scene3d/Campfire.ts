import * as THREE from 'three'
import { markDetail, mergeStatic } from './merge'
import { makeRadialTexture } from './textures'

const EMBERS = 18

/** 一小堆篝火：闪烁的暖色点光 + 火苗 + 上升的火星。冷月之外的主暖光。 */
export class Campfire {
  readonly group = new THREE.Group()
  private light: THREE.PointLight
  private flames: THREE.Sprite[] = []
  private embers: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>

  constructor() {
    const wood = new THREE.MeshStandardMaterial({ color: 0x1a1412, roughness: 1 })
    const logGeo = new THREE.CylinderGeometry(0.035, 0.04, 0.55, 6)
    for (let i = 0; i < 4; i++) {
      const log = new THREE.Mesh(logGeo, wood)
      const a = (i / 4) * Math.PI * 2 + 0.4
      log.position.set(Math.cos(a) * 0.1, 0.12, Math.sin(a) * 0.1)
      log.rotation.set(Math.sin(a) * 0.95, 0, -Math.cos(a) * 0.95)
      log.castShadow = true
      this.group.add(log)
    }

    const stoneGeo = new THREE.IcosahedronGeometry(0.09, 0)
    const stone = new THREE.MeshStandardMaterial({ color: 0x353c4f, roughness: 1, flatShading: true })
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(stoneGeo, stone)
      const a = (i / 7) * Math.PI * 2
      s.position.set(Math.cos(a) * 0.36, 0.04, Math.sin(a) * 0.36)
      s.rotation.set(i, i * 2.1, i * 0.7)
      s.scale.setScalar(0.8 + (i % 3) * 0.25)
      s.castShadow = true
      s.receiveShadow = true
      this.group.add(s)
    }
    mergeStatic(this.group)

    const flameTex = makeRadialTexture([
      [0, 'rgba(255,244,214,1)'],
      [0.25, 'rgba(255,170,70,0.85)'],
      [0.6, 'rgba(230,80,30,0.3)'],
      [1, 'rgba(200,50,20,0)'],
    ])
    for (let i = 0; i < 3; i++) {
      const flame = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: flameTex,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false,
          toneMapped: false,
        }),
      )
      flame.center.set(0.5, 0.18)
      flame.position.set((i - 1) * 0.06, 0.1, (i % 2) * 0.05)
      this.flames.push(flame)
      this.group.add(flame)
    }

    this.light = new THREE.PointLight(0xff8a3c, 6, 11, 2)
    this.light.position.set(0, 0.45, 0)
    this.group.add(this.light)

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(EMBERS * 3), 3))
    this.embers = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        map: makeRadialTexture(
          [
            [0, 'rgba(255,255,255,1)'],
            [1, 'rgba(255,255,255,0)'],
          ],
          32,
        ),
        color: 0xffa050,
        size: 0.03,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        toneMapped: false,
      }),
    )
    this.embers.frustumCulled = false
    markDetail(this.embers)
    this.group.add(this.embers)
  }

  /** strength: 0 ~ 1 */
  update(time: number, strength: number) {
    const flicker =
      0.82 + 0.1 * Math.sin(time * 11.3) + 0.06 * Math.sin(time * 23.7 + 1.3) + 0.04 * Math.sin(time * 37.1 + 0.6)
    this.light.intensity = 6.5 * flicker * strength
    this.light.position.x = Math.sin(time * 9.1) * 0.03
    this.light.position.z = Math.cos(time * 7.3) * 0.03

    this.flames.forEach((flame, i) => {
      const f = 0.8 + 0.2 * Math.sin(time * (9 + i * 3.1) + i * 2)
      const s = (0.3 + i * 0.05) * (0.45 + 0.55 * strength)
      flame.scale.set(s * (0.9 + 0.1 * f), s * 1.7 * f, 1)
      flame.material.opacity = (0.55 + 0.25 * f) * (0.3 + 0.7 * strength)
    })

    const pos = this.embers.geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < EMBERS; i++) {
      const life = (time * (0.22 + (i % 5) * 0.045) + i * 0.137) % 1
      pos.setXYZ(
        i,
        Math.sin(time * 1.3 + i * 2.4) * 0.12 * life + life * 0.35,
        0.25 + life * 1.5,
        Math.cos(time * 1.1 + i * 1.9) * 0.12 * life + life * 0.1,
      )
    }
    pos.needsUpdate = true
    this.embers.material.opacity = 0.85 * strength
  }
}
