import * as THREE from 'three'
import { markDetail, mergeStatic } from './merge'
import { makeRadialTexture } from './textures'

const EMBERS = 18
const STEAM_COUNT = 6

/** 一小堆篝火：晴/雪天温暖燃烧，雨天完全熄灭并升起湿润青烟。冷月之外的主暖光。 */
export class Campfire {
  readonly group = new THREE.Group()
  private light: THREE.PointLight
  private flames: THREE.Sprite[] = []
  private embers: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>
  private steams: THREE.Sprite[] = []
  private woodMat: THREE.MeshStandardMaterial
  private stoneMat: THREE.MeshStandardMaterial
  private dryWoodColor = new THREE.Color(0x1a1412)
  private wetWoodColor = new THREE.Color(0x0b090c)
  private dryStoneColor = new THREE.Color(0x353c4f)
  private wetStoneColor = new THREE.Color(0x1e2230)
  private snowStoneColor = new THREE.Color(0x7c879e)

  constructor() {
    const wood = new THREE.MeshStandardMaterial({ color: 0x1a1412, roughness: 1 })
    this.woodMat = wood
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
    this.stoneMat = stone
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

    // 雨天熄火后从湿炭升起的青白水汽烟缕
    const steamTex = makeRadialTexture([
      [0, 'rgba(215,222,240,0.52)'],
      [0.45, 'rgba(182,192,216,0.22)'],
      [1, 'rgba(160,172,200,0)'],
    ])
    for (let i = 0; i < STEAM_COUNT; i++) {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: steamTex,
          transparent: true,
          depthWrite: false,
          opacity: 0,
        }),
      )
      sp.visible = false
      markDetail(sp)
      this.steams.push(sp)
      this.group.add(sp)
    }
  }

  /** strength: 0 ~ 1.2，rain / snow: 0 ~ 1 */
  update(time: number, strength: number, rain = 0, snow = 0) {
    // 湿木与围石质感随雨雪变化
    this.woodMat.color.copy(this.dryWoodColor).lerp(this.wetWoodColor, rain)
    this.woodMat.roughness = THREE.MathUtils.lerp(1.0, 0.52, rain)
    this.stoneMat.color
      .copy(this.dryStoneColor)
      .lerp(this.wetStoneColor, rain)
      .lerp(this.snowStoneColor, snow * 0.42)
    this.stoneMat.roughness = THREE.MathUtils.lerp(1.0, 0.56, rain)

    // 下雨时火势压灭至 0；下雪时略旺一分映暖雪地
    const eff = Math.max(0, strength * Math.max(0, 1 - rain * 1.18) * (1 + snow * 0.16))
    const lit = eff > 0.015

    const flicker =
      0.82 + 0.1 * Math.sin(time * 11.3) + 0.06 * Math.sin(time * 23.7 + 1.3) + 0.04 * Math.sin(time * 37.1 + 0.6)
    this.light.intensity = lit ? 6.5 * flicker * eff : 0
    this.light.position.x = Math.sin(time * 9.1) * 0.03
    this.light.position.z = Math.cos(time * 7.3) * 0.03

    this.flames.forEach((flame, i) => {
      flame.visible = lit
      if (!lit) return
      const f = 0.8 + 0.2 * Math.sin(time * (9 + i * 3.1) + i * 2)
      const s = (0.3 + i * 0.05) * (0.38 + 0.62 * eff) * (1 + snow * 0.12)
      flame.scale.set(s * (0.9 + 0.1 * f), s * 1.72 * f, 1)
      flame.material.opacity = Math.min(1, (0.55 + 0.25 * f) * (0.25 + 0.75 * eff))
    })

    this.embers.visible = lit
    if (lit) {
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
      this.embers.material.opacity = Math.min(1, 0.85 * eff)
    }

    // 熄火湿烟：雨天显现
    const showSteam = rain > 0.15
    for (let i = 0; i < this.steams.length; i++) {
      const sp = this.steams[i]
      sp.visible = showSteam
      if (!showSteam) continue
      const life = (time * 0.24 + i / this.steams.length) % 1
      sp.position.set(
        Math.sin(time * 0.9 + i * 1.9) * 0.12 * life - life * 0.28,
        0.14 + life * 1.35,
        Math.cos(time * 0.7 + i * 1.4) * 0.1 * life - life * 0.08,
      )
      const sc = 0.26 + life * 0.68
      sp.scale.set(sc, sc * 0.9, 1)
      sp.material.opacity = Math.sin(life * Math.PI) * 0.38 * rain
    }
  }
}
