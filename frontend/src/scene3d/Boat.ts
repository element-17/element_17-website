import * as THREE from 'three'
import { seededRandom } from '../config/random'
import { markDetail, mergeStatic } from './merge'
import { WATER_Y, farShore, nearShore, groundHeight } from './River'
import { makeRadialTexture } from './textures'

/** 纸灯笼的共用材质（船头与岸边陈设都用同一套观感） */
export const makeLanternParts = (at: THREE.Vector3) => {
  const paper = new THREE.MeshStandardMaterial({
    color: 0xf3d3a6,
    roughness: 0.82,
    emissive: 0xff9a4a,
    emissiveIntensity: 1.5,
    side: THREE.DoubleSide,
  })
  const rib = new THREE.MeshStandardMaterial({ color: 0x2a1f1a, roughness: 0.9 })

  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), paper)
  globe.scale.set(1, 1.22, 1)
  globe.position.copy(at)
  globe.castShadow = true

  const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 10), rib)
  capTop.position.copy(at).add(new THREE.Vector3(0, 0.19, 0))
  const capBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 10), rib)
  capBottom.position.copy(at).add(new THREE.Vector3(0, -0.19, 0))
  const tassel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.006, 0.12, 5),
    new THREE.MeshStandardMaterial({ color: 0xc9353f, roughness: 0.8 }),
  )
  tassel.position.copy(at).add(new THREE.Vector3(0, -0.26, 0))

  return { globe, parts: [globe, capTop, capBottom, tassel] }
}

/**
 * 一条泊在月下河心的乌篷船：船身 + 弧形篷 + 船头纸灯笼。
 * 泊在营地左前方河面，归处与传书机位都能望见船灯与倒影。
 */
export class Boat {
  readonly group = new THREE.Group()
  private body = new THREE.Group()
  private lanternMat: THREE.MeshStandardMaterial
  private halo: THREE.Sprite
  private baseY: number
  private phase = 1.7

  constructor() {
    const wood = new THREE.MeshStandardMaterial({ color: 0x241d2c, roughness: 0.88 })
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x161220, roughness: 0.95 })
    const mat = new THREE.MeshStandardMaterial({ color: 0x2b2436, roughness: 0.9, flatShading: true })

    // 船身：两头收窄的梭形
    const hullGeo = new THREE.CylinderGeometry(0.46, 0.46, 3.5, 12, 3)
    const pos = hullGeo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      const t = Math.abs(y) / 1.75
      const taper = 1 - t ** 2.2 * 0.82
      pos.setX(i, pos.getX(i) * taper)
      pos.setZ(i, pos.getZ(i) * taper * 0.9)
    }
    hullGeo.computeVertexNormals()
    hullGeo.rotateZ(Math.PI / 2)
    const hull = new THREE.Mesh(hullGeo, wood)

    const keel = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.14, 0.5), darkWood)
    keel.position.y = -0.3

    const gunwaleGeo = new THREE.BoxGeometry(3.1, 0.05, 0.06)
    const gunwaleL = new THREE.Mesh(gunwaleGeo, darkWood)
    gunwaleL.position.set(0, 0.2, 0.42)
    const gunwaleR = new THREE.Mesh(gunwaleGeo, darkWood)
    gunwaleR.position.set(0, 0.2, -0.42)

    const canopyGeo = new THREE.CylinderGeometry(0.62, 0.62, 1.85, 14, 1, true, 0, Math.PI)
    canopyGeo.rotateZ(Math.PI / 2)
    canopyGeo.rotateY(Math.PI / 2)
    const canopy = new THREE.Mesh(canopyGeo, mat)
    canopy.position.set(-0.35, 0.22, 0)

    for (let i = 0; i < 4; i++) {
      const ribGeo = new THREE.TorusGeometry(0.62, 0.02, 5, 12, Math.PI)
      const rib = new THREE.Mesh(ribGeo, darkWood)
      rib.position.set(-1.15 + i * 0.55, 0.22, 0)
      this.body.add(rib)
    }

    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.05, 0.72), wood)
    deck.position.set(1.15, 0.12, 0)

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.78, 6), darkWood)
    pole.position.set(1.55, 0.5, 0.12)
    pole.rotation.z = -0.16

    // 纸灯笼：远处用柔光晕 Sprite 代替全局 PointLight，水面依然拖出暖色倒影
    const at = new THREE.Vector3(1.72, 0.92, 0.14)
    const { globe, parts } = makeLanternParts(at)
    globe.castShadow = false
    this.lanternMat = globe.material
    const hang = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 4), darkWood)
    hang.position.copy(at).add(new THREE.Vector3(0, 0.3, 0))

    const haloTex = makeRadialTexture([
      [0, 'rgba(255,215,150,0.85)'],
      [0.3, 'rgba(255,155,70,0.34)'],
      [1, 'rgba(255,110,40,0)'],
    ])
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: haloTex,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        toneMapped: false,
        opacity: 0.75,
      }),
    )
    this.halo.position.copy(at)
    this.halo.scale.setScalar(1.9)

    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.1, 3), darkWood)
    rope.position.set(2.1, -0.35, 0.16)
    rope.rotation.z = 0.28

    this.body.add(hull, keel, gunwaleL, gunwaleR, canopy, deck, pole, hang, ...parts, rope)
    mergeStatic(this.body)
    this.body.add(this.halo)

    // 泊位：月色下的左前方河心，归处与传书机位皆入画
    const x = -10.5
    const z = -28
    this.baseY = WATER_Y - 0.12
    this.group.add(this.body)
    this.group.position.set(x, this.baseY, z)
    this.group.rotation.y = 0.28
  }

  update(time: number) {
    this.group.position.y = this.baseY + Math.sin(time * 0.62) * 0.03
    this.group.rotation.z = Math.sin(time * 0.47 + 0.8) * 0.026
    this.group.rotation.x = Math.sin(time * 0.53 + 2.1) * 0.012

    const f = 0.84 + 0.1 * Math.sin(time * 2.7 + this.phase) + 0.05 * Math.sin(time * 11.3 + this.phase * 1.7)
    this.lanternMat.emissiveIntensity = 1.65 * f + 0.45
    this.halo.scale.setScalar(1.85 * (0.92 + 0.12 * f))
    this.halo.material.opacity = 0.65 * f + 0.18
  }
}

/**
 * 对岸小码头：木桩打在水下，上铺木板，从对岸水线往河里伸出 4~5m。
 */
export class Dock {
  readonly group = new THREE.Group()

  constructor(x = 10) {
    const rand = seededRandom(99)
    const wood = new THREE.MeshStandardMaterial({ color: 0x261f2e, roughness: 0.92 })
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x171221, roughness: 0.96 })

    const shoreZ = farShore(x)
    const len = 4.6
    const halfW = 0.85

    const pileGeo = new THREE.CylinderGeometry(0.09, 0.11, 3.4, 6)
    for (const dz of [0, -len]) {
      for (const dx of [-halfW, halfW]) {
        const pile = new THREE.Mesh(pileGeo, darkWood)
        pile.position.set(dx, -1.7 + 0.34, dz)
        this.group.add(pile)
      }
    }

    const plankGeo = new THREE.BoxGeometry(halfW * 2 + 0.16, 0.07, 0.34)
    const count = Math.floor(len / 0.42)
    for (let i = 0; i < count; i++) {
      const plank = new THREE.Mesh(plankGeo, i % 3 === 0 ? darkWood : wood)
      plank.position.set(0, 0.34, -0.1 - i * 0.42)
      plank.rotation.y = (rand() - 0.5) * 0.02
      this.group.add(plank)
    }

    for (const dx of [-halfW, halfW]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, len + 0.3), darkWood)
      beam.position.set(dx, 0.24, -len / 2)
      this.group.add(beam)
    }

    const ramp = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2, 0.06, 0.9), wood)
    ramp.position.set(0, 0.28, 0.55)
    ramp.rotation.x = -0.12
    this.group.add(ramp)

    this.group.position.set(x, WATER_Y + 0.02, shoreZ + 0.25)
    mergeStatic(this.group)
  }
}

/**
 * 近岸的系船桩与倒伏枯木：沿营地前方的水线错落摆放。
 */
export class ShoreProps {
  readonly group = new THREE.Group()

  constructor() {
    const bark = new THREE.MeshStandardMaterial({ color: 0x1a1622, roughness: 1, flatShading: true })
    const wood = new THREE.MeshStandardMaterial({ color: 0x211a29, roughness: 0.95 })

    const logs: [number, number, number][] = [
      [-11.8, 1.5, 0.16],
      [8.2, 1.8, 0.19],
      [16.5, 1.3, 0.14],
    ]
    for (const [x, len, r] of logs) {
      const z = nearShore(x) + 0.15
      const logGeo = new THREE.CylinderGeometry(r, r * 0.78, len, 7)
      logGeo.rotateZ(Math.PI / 2)
      const log = new THREE.Mesh(logGeo, bark)
      log.position.set(x, groundHeight(x, z) + r * 0.55, z)
      log.rotation.set(0.06, 0.35, -0.16)
      markDetail(log)
      this.group.add(log)
    }

    for (const x of [-6.8, 5.4]) {
      const z = nearShore(x) - 0.55
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 1.5, 6), wood)
      pile.position.set(x, WATER_Y + 0.42, z)
      pile.rotation.z = (x > 0 ? 1 : -1) * 0.05
      this.group.add(pile)

      const rope = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.018, 4, 10, Math.PI * 1.2), wood)
      rope.position.set(x, WATER_Y + 1.05, z)
      rope.rotation.set(Math.PI / 2, 0, 0.4)
      markDetail(rope)
      this.group.add(rope)
    }

    mergeStatic(this.group)
  }
}
