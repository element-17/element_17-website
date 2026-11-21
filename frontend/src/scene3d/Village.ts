import * as THREE from 'three'
import type { QualityPreset } from '../config/quality'
import { seededRandom } from '../config/random'
import { markDetail, mergeStatic } from './merge'
import { makeRadialTexture } from './textures'

interface LampGroup {
  mat: THREE.MeshStandardMaterial
  phase: number
  base: number
}

/** 炊烟：烟囱口往上飘的一团雾，循环上升并淡出 */
interface Smoke {
  sprites: THREE.Sprite[]
  origin: THREE.Vector3
  height: number
  speed: number
  phase: number
}

/** 房屋错落成三排，排与排之间留出巷子；左侧岬角外留给月亮与开阔水面 */
const HOUSE_ROWS: { z: number; count: number; x0: number; step: number }[] = [
  { z: -64, count: 5, x0: -14, step: 15 },
  { z: -76, count: 4, x0: -6, step: 16 },
  { z: -88, count: 3, x0: 2, step: 17 },
]

/** 村里的枯树剪影：[x, z, 高度] */
const DEAD_TREES: [number, number, number][] = [
  [-6, -58, 9],
  [5, -71, 11],
  [21, -59, 8],
  [33, -78, 10],
  [44, -62, 9],
  [14, -85, 8],
]

/** 远处的村落：房屋剪影 + 分组闪烁的窗灯 + 烟囱炊烟 + 枯树（全部静态合并） */
export class Village {
  readonly group = new THREE.Group()
  private lampGroups: LampGroup[] = []
  private smokes: Smoke[] = []
  private smokeActive = true

  constructor() {
    const rand = seededRandom(52)
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1d1a30,
      metalness: 0,
      roughness: 0.95,
    })
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x100d1c,
      metalness: 0,
      roughness: 0.98,
      flatShading: false,
    })
    const chimneyMat = new THREE.MeshStandardMaterial({ color: 0x191524, roughness: 1 })
    const boxGeo = new THREE.BoxGeometry(1, 1, 1)
    const roofGeo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4)
    roofGeo.rotateY(Math.PI / 4)

    // 全部窗灯共用 4 套材质做错峰闪烁，合并后只占 4 个 draw call
    for (let g = 0; g < 4; g++) {
      this.lampGroups.push({
        mat: new THREE.MeshStandardMaterial({
          color: 0x000000,
          emissive: 0xffa84a,
          emissiveIntensity: 1.6,
        }),
        phase: g * 2.3 + rand() * 1.4,
        base: 1.3 + rand() * 0.55,
      })
    }

    let index = 0
    for (const row of HOUSE_ROWS) {
      for (let h = 0; h < row.count; h++) {
        const x = row.x0 + h * row.step + (rand() - 0.5) * 5.5
        const z = row.z + (rand() - 0.5) * 5
        const w = 4.5 + rand() * 3.5
        const wallH = 3.2 + rand() * 1.8
        const d = 4 + rand() * 3

        const wall = new THREE.Mesh(boxGeo, wallMat)
        wall.scale.set(w, wallH, d)
        wall.position.set(x, wallH / 2, z)

        const eaves = 0.34
        const roof = new THREE.Mesh(roofGeo, roofMat)
        roof.scale.set(w + eaves * 2, 1.8, d + eaves * 2)
        roof.position.set(x, wallH + 0.9, z)

        const fascia = new THREE.Mesh(boxGeo, chimneyMat)
        fascia.scale.set(w + eaves * 2, 0.16, d + eaves * 2)
        fascia.position.set(x, wallH + 0.06, z)

        this.group.add(wall, roof, fascia)
        this.addWindows(x, z, w, d, wallH, rand)

        if (index % 3 === 0) {
          this.addChimney(x, z, w, d, wallH, chimneyMat, boxGeo, rand)
        }
        index++
      }
    }

    this.buildDeadTrees(rand)

    mergeStatic(this.group)
  }

  applyQuality({ liteShaders }: QualityPreset) {
    this.smokeActive = !liteShaders
    for (const s of this.smokes) {
      for (const sp of s.sprites) sp.visible = this.smokeActive
    }
  }

  /** 每栋 2~3 扇窗：正面一两扇、侧面一扇，分摊到 4 套共享材质里 */
  private addWindows(x: number, z: number, w: number, d: number, wallH: number, rand: () => number) {
    const front = z + d / 2 + 0.02
    const count = 2 + (rand() < 0.45 ? 1 : 0)
    for (let i = 0; i < count; i++) {
      const side = i === 2
      const ww = 0.34 + rand() * 0.26
      const wh = ww * (0.9 + rand() * 0.6)
      const group = this.lampGroups[Math.floor(rand() * this.lampGroups.length)]
      const win = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), group.mat)
      if (side) {
        win.position.set(x + w / 2 + 0.02, wallH * (0.4 + rand() * 0.25), z + (rand() - 0.5) * d * 0.6)
        win.rotation.y = Math.PI / 2
      } else {
        const spread = count === 1 ? 0 : (i - 0.5) * w * 0.3
        win.position.set(x + spread + (rand() - 0.5) * 0.3, wallH * (0.38 + rand() * 0.3), front)
      }
      this.group.add(win)
    }
  }

  /** 烟囱：立在屋顶一侧，比屋脊略高；同时挂一缕炊烟 */
  private addChimney(
    x: number,
    z: number,
    w: number,
    d: number,
    wallH: number,
    mat: THREE.Material,
    boxGeo: THREE.BoxGeometry,
    rand: () => number,
  ) {
    const cw = 0.42 + rand() * 0.16
    const ch = 1.5 + rand() * 0.8
    const cx = x + (rand() < 0.5 ? -1 : 1) * w * 0.3
    const cz = z - d * 0.16
    const chimney = new THREE.Mesh(boxGeo, mat)
    chimney.scale.set(cw, ch, cw)
    chimney.position.set(cx, wallH + 1.5 - ch * 0.2, cz)
    this.group.add(chimney)

    const topY = chimney.position.y + ch / 2
    const tex =
      Village.smokeTex ??
      (Village.smokeTex = makeRadialTexture([
        [0, 'rgba(206,186,236,0.55)'],
        [0.45, 'rgba(178,156,214,0.18)'],
        [1, 'rgba(168,146,206,0)'],
      ]))
    const sprites: THREE.Sprite[] = []
    for (let i = 0; i < 4; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, opacity: 0 }))
      sprite.position.set(cx, topY, cz)
      markDetail(sprite)
      this.group.add(sprite)
      sprites.push(sprite)
    }
    this.smokes.push({
      sprites,
      origin: new THREE.Vector3(cx, topY, cz),
      height: 4.2 + rand() * 1.8,
      speed: 0.1 + rand() * 0.06,
      phase: rand() * 10,
    })
  }

  /** 枯树剪影：两三层分叉的光秃枝干，和房屋混在一起衬出村落轮廓 */
  private buildDeadTrees(rand: () => number) {
    const bark = new THREE.MeshStandardMaterial({ color: 0x110e1b, roughness: 1, flatShading: true })
    const geo = new THREE.CylinderGeometry(0.55, 1, 1, 5)
    geo.translate(0, 0.5, 0)
    const up = new THREE.Vector3(0, 1, 0)

    const grow = (
      tree: THREE.Group,
      start: THREE.Vector3,
      dir: THREE.Vector3,
      length: number,
      radius: number,
      depth: number,
    ) => {
      const m = new THREE.Mesh(geo, bark)
      m.position.copy(start)
      m.quaternion.setFromUnitVectors(up, dir)
      m.scale.set(radius, length, radius)
      tree.add(m)
      if (depth === 0) return
      const end = start.clone().addScaledVector(dir, length)
      for (let i = 0; i < 2 + Math.floor(rand() * 2); i++) {
        const d = dir
          .clone()
          .add(new THREE.Vector3((rand() - 0.5) * 1.6, (rand() - 0.3) * 0.8, (rand() - 0.5) * 1.6))
          .normalize()
        grow(tree, end, d, length * (0.52 + rand() * 0.16), radius * 0.55, depth - 1)
      }
    }

    for (const [x, z, height] of DEAD_TREES) {
      const tree = new THREE.Group()
      grow(
        tree,
        new THREE.Vector3(0, -0.05, 0),
        new THREE.Vector3(0.12, 1, (rand() - 0.5) * 0.3).normalize(),
        height * 0.5,
        height * 0.045,
        2,
      )
      tree.position.set(x, 0, z)
      tree.rotation.y = rand() * 6.28
      this.group.add(tree)
    }
  }

  private static smokeTex: THREE.Texture | null = null

  update(time: number) {
    for (const { mat, phase, base } of this.lampGroups) {
      const f = 0.78 + 0.2 * Math.sin(time * (1.8 + (phase % 2.4)) + phase) + 0.06 * Math.sin(time * 13 + phase * 3)
      mat.emissiveIntensity = base * f
    }
    if (!this.smokeActive) return
    for (const { sprites, origin, height, speed, phase } of this.smokes) {
      const n = sprites.length
      for (let i = 0; i < n; i++) {
        const sprite = sprites[i]
        const life = (time * speed + i / n + phase * 0.05) % 1
        sprite.position.set(
          origin.x + Math.sin(time * 0.5 + i * 1.7 + phase) * 0.35 + life * 1.1,
          origin.y + life * height,
          origin.z + Math.cos(time * 0.4 + i * 1.3 + phase) * 0.3,
        )
        const grow = 1 + life * 2.2
        sprite.scale.set(1.5 * grow, 1.3 * grow, 1)
        sprite.material.opacity = 0.3 * Math.sin(Math.PI * Math.min(life * 1.1, 1))
      }
    }
  }
}
