import * as THREE from 'three'
import type { ModuleId } from '../config/modules'
import { CAMP, SCROLL_PAPER, SCROLL_TABLE_Y } from '../config/shots'
import { seededRandom } from '../config/random'
import { makeLanternParts } from './Boat'
import { markDynamic, mergeStatic } from './merge'
import { makeRadialTexture } from './textures'

/** 纸灯笼：灯芯光 + 纸面球（用来做呼吸式闪烁） */
interface Lantern {
  light: THREE.PointLight
  globe: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>
  phase: number
  base: number
}

export interface InteractZone {
  id: ModuleId
  center: THREE.Vector3
  radius: number
}

/**
 * 卷面纸纹：米黄底 + 纤维 + 几处旧渍 + 一圈朱褐色的双线边框。
 * 刻意不写一个字——卷上的文章是叠在画布上的 HTML（见 SheetProjector）。
 */
const makePaperTexture = () => {
  const W = 1024
  const H = Math.round(W * (SCROLL_PAPER.d / SCROLL_PAPER.w))
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const rand = seededRandom(404)

  const base = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.1, W * 0.5, H * 0.5, W * 0.62)
  base.addColorStop(0, '#ecdcb6')
  base.addColorStop(0.7, '#dcc595')
  base.addColorStop(1, '#b89a68')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, W, H)

  // 纤维：细短的浅 / 深划痕
  for (let i = 0; i < 2200; i++) {
    const x = rand() * W
    const y = rand() * H
    const len = 4 + rand() * 18
    const a = rand() * Math.PI
    ctx.strokeStyle = rand() < 0.5 ? 'rgba(255,248,226,0.18)' : 'rgba(120,90,50,0.09)'
    ctx.lineWidth = 0.6 + rand() * 0.8
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len)
    ctx.stroke()
  }
  // 旧渍
  for (let i = 0; i < 7; i++) {
    const x = rand() * W
    const y = rand() * H
    const r = 30 + rand() * 90
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(140,100,50,0.10)')
    g.addColorStop(1, 'rgba(140,100,50,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  // 双线边框
  ctx.strokeStyle = 'rgba(112,40,28,0.75)'
  const inset = H * 0.06
  ctx.lineWidth = 4
  ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2)
  ctx.lineWidth = 1.5
  const inset2 = inset + 9
  ctx.strokeRect(inset2, inset2, W - inset2 * 2, H - inset2 * 2)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/**
 * 营地里的三件陈设，都在篝火几步之内：
 * - 藏卷 blog：篝火左前方的矮几，几上摊开一卷古卷（卷面四角给 DOM 文字做透视贴合）
 * - 铸剑 projects：主角右后方的树桩铁砧 + 插在地上的三把剑
 * - 传书 contact：篝火左后方靠水的挂灯木杆 + 信箱 + 一只信鸽
 */
export class CampProps {
  readonly group = new THREE.Group()
  /** 卷面可写区域四角（世界坐标，已缩进双线边框内）：左上 / 右上 / 右下 / 左下 */
  readonly sheetCorners: THREE.Vector3[] = []
  /** 点击 3D 场景里的陈设即可切到对应模块（只用球体求交，零逐帧开销） */
  readonly interactZones: InteractZone[] = [
    { id: 'blog', center: new THREE.Vector3(CAMP.scroll.x, SCROLL_TABLE_Y + 0.08, CAMP.scroll.z), radius: 0.72 },
    { id: 'projects', center: new THREE.Vector3(CAMP.anvil.x, 0.55, CAMP.anvil.z), radius: 0.95 },
    { id: 'about', center: new THREE.Vector3(CAMP.hero.x + 0.35, 0.85, CAMP.hero.z - 0.1), radius: 0.75 },
    { id: 'contact', center: new THREE.Vector3(CAMP.post.x, 1.15, CAMP.post.z), radius: 0.9 },
  ]
  private lanterns: Lantern[] = []
  private pigeonHead: THREE.Object3D | null = null
  private kite: THREE.Object3D | null = null
  private hotSteelMat: THREE.MeshStandardMaterial | null = null
  private forgeGlow: THREE.Sprite | null = null

  constructor() {
    const rand = seededRandom(83)
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x231c2e, roughness: 0.92 })
    const stone = new THREE.MeshStandardMaterial({
      color: 0x35304a,
      roughness: 1,
      flatShading: true,
      emissive: 0x171226,
      emissiveIntensity: 0.9,
    })
    // 铁器：锻打后的暗铁质感，粗糙度收稳避免掠射角高光在辉光里过曝
    const metal = new THREE.MeshStandardMaterial({ color: 0x5c5775, metalness: 0.48, roughness: 0.58 })
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x8f8aa8,
      metalness: 0.48,
      roughness: 0.5,
      emissive: 0x262040,
      emissiveIntensity: 0.32,
    })

    this.buildScrollTable(rand)
    this.buildAnvil(rand, metal, darkWood, bladeMat, stone)
    this.buildPost(darkWood, stone)
    mergeStatic(this.group)
  }

  // ---------- 藏卷 blog：矮几 + 古卷 + 笔砚 ----------
  private buildScrollTable(rand: () => number) {
    const s = CAMP.scroll
    const g = new THREE.Group()
    const { w, d } = SCROLL_PAPER
    const y = SCROLL_TABLE_Y

    // 矮几：一块厚桌面 + 四条腿 + 两道横枨，木色比夜色暖一点，篝火照过来才有层次
    const wood = new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.85 })
    const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.36, 0.045, d + 0.22), wood)
    top.position.y = y - 0.0225
    top.castShadow = true
    top.receiveShadow = true
    g.add(top)
    const legGeo = new THREE.BoxGeometry(0.055, y - 0.045, 0.055)
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(legGeo, wood)
        leg.position.set(sx * (w / 2 + 0.1), (y - 0.045) / 2, sz * (d / 2 + 0.04))
        leg.castShadow = true
        g.add(leg)
      }
      const stretcher = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, d + 0.08), wood)
      stretcher.position.set(sx * (w / 2 + 0.1), 0.07, 0)
      g.add(stretcher)
    }

    // 卷面：一张平铺的纸，只有纸纹与边框
    const paperMat = new THREE.MeshStandardMaterial({
      map: makePaperTexture(),
      roughness: 0.94,
      // 一点自发光托住暗部：月光照不到的那一侧也读得清上面的墨字
      emissive: 0x5a4226,
      emissiveIntensity: 0.32,
    })
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), paperMat)
    paper.position.y = y + 0.003
    paper.receiveShadow = true
    g.add(paper)

    // 卷轴：右端一根木轴，左端是还没展开的那一卷纸
    const rodMat = new THREE.MeshStandardMaterial({ color: 0x24160f, roughness: 0.6 })
    const knobMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, metalness: 0.5, roughness: 0.45 })
    const rolledMat = new THREE.MeshStandardMaterial({ color: 0xc8ae7c, roughness: 0.95, emissive: 0x3a2a16, emissiveIntensity: 0.25 })
    const axis = (x: number, r: number) => {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, d + 0.12, 8).rotateX(Math.PI / 2), rodMat)
      rod.position.set(x, y + r, 0)
      rod.castShadow = true
      g.add(rod)
      for (const sz of [-1, 1]) {
        const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.026, 10).rotateX(Math.PI / 2), knobMat)
        knob.position.set(x, y + r, sz * (d / 2 + 0.07))
        g.add(knob)
      }
    }
    axis(w / 2 + 0.012, 0.016)
    const rolled = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, d, 16).rotateX(Math.PI / 2), rolledMat)
    rolled.position.set(-w / 2 - 0.035, y + 0.042, 0)
    rolled.castShadow = true
    g.add(rolled)
    axis(-w / 2 - 0.035, 0.042)
    // 卷首系带：一截朱红的丝绦搭在桌沿
    const tie = new THREE.Mesh(
      new THREE.BoxGeometry(0.018, 0.004, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x9e2a33, roughness: 0.8 }),
    )
    tie.position.set(-w / 2 - 0.06, y + 0.004, d / 2 + 0.08)
    tie.rotation.y = 0.5
    g.add(tie)

    // 笔与砚：在卷的右前角
    const inkstone = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.024, 0.085),
      new THREE.MeshStandardMaterial({ color: 0x15121a, roughness: 0.5 }),
    )
    inkstone.position.set(w / 2 + 0.1, y + 0.012, -d / 2 + 0.02)
    inkstone.rotation.y = 0.2 + rand() * 0.1
    inkstone.castShadow = true
    const brush = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.22, 6).rotateZ(Math.PI / 2), rodMat)
    brush.position.set(w / 2 + 0.06, y + 0.008, d / 2 + 0.06)
    brush.rotation.y = -0.35
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.011, 0.045, 6).rotateZ(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x0d0b10, roughness: 0.9 }),
    )
    tip.position.set(-0.13, 0, 0)
    brush.add(tip)
    g.add(inkstone, brush)

    g.position.set(s.x, 0, s.z)
    g.rotation.y = s.yaw
    this.group.add(g)

    // 卷面四角（缩进朱褐双线边框内，让 DOM 墨字落在界栏之中）
    g.updateMatrixWorld(true)
    const py = y + 0.005
    const iw = w * 0.445
    const id = d * 0.39
    for (const [x, z] of [
      [-iw, -id],
      [iw, -id],
      [iw, id],
      [-iw, id],
    ]) {
      this.sheetCorners.push(new THREE.Vector3(x, py, z).applyMatrix4(g.matrixWorld))
    }
  }

  // ---------- 铸剑 projects：铁砧 + 插在地上的剑 ----------
  private buildAnvil(
    rand: () => number,
    metal: THREE.Material,
    wood: THREE.Material,
    bladeMat: THREE.Material,
    stone: THREE.Material,
  ) {
    const s = CAMP.anvil
    const g = new THREE.Group()

    // 树桩底座
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.44, 9), wood)
    stump.position.y = 0.22
    stump.castShadow = true
    stump.receiveShadow = true

    // 铁砧：下宽上窄的块 + 伸出去的角
    const belly = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.2, 0.3), metal)
    belly.position.set(0, 0.54, 0)
    const waist = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.22), metal)
    waist.position.set(0, 0.4, 0)
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.09, 0.28), metal)
    face.position.set(0, 0.66, 0)
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 6), metal)
    horn.rotation.z = -Math.PI / 2
    horn.position.set(-0.44, 0.66, 0)
    for (const m of [belly, waist, face, horn]) {
      m.castShadow = true
      m.receiveShadow = true
    }

    // 锤子靠在砧边：柄 + 头
    const hammerGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.46, 6), wood)
    hammerGrip.position.set(0.46, 0.5, 0.16)
    hammerGrip.rotation.z = 0.5
    const hammerHead = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.1), metal)
    hammerHead.position.set(0.58, 0.7, 0.16)
    hammerHead.rotation.z = 0.5
    hammerGrip.castShadow = true
    hammerHead.castShadow = true

    // 三把插在地上的剑：剑身斜插入土，护手与柄露出
    const swordAt = (x: number, z: number, tilt: number, yaw: number, len: number) => {
      const sw = new THREE.Group()
      const bladeGeo = new THREE.BoxGeometry(0.028, len, 0.008)
      bladeGeo.translate(0, len / 2, 0)
      const blade = new THREE.Mesh(bladeGeo, bladeMat)
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.026, 0.036), metal)
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.2, 6), wood)
      grip.position.y = -0.11
      const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), metal)
      pommel.position.y = -0.22
      blade.castShadow = true
      guard.castShadow = true
      grip.castShadow = true
      sw.add(blade, guard, grip, pommel)
      // 剑身大半插进土里：整把剑倒过来，剑尖朝下
      sw.rotation.set(tilt * 0.35, yaw, Math.PI + tilt)
      sw.position.set(x, 0.62, z)
      return sw
    }
    g.add(
      swordAt(-0.95, 0.3, 0.16, 0.4, 0.95),
      swordAt(-0.66, -0.42, -0.2, -0.9, 0.85),
      swordAt(0.88, -0.48, 0.14, 1.9, 0.98),
    )

    // 一小堆待打的铁料与打下的碎屑
    const scraps = new THREE.MeshStandardMaterial({ color: 0x1d1a26, metalness: 0.4, roughness: 0.6 })
    for (let i = 0; i < 7; i++) {
      const chip = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05 + rand() * 0.05, 0), i % 2 ? metal : scraps)
      const a = rand() * Math.PI * 2
      const r = 0.5 + rand() * 0.45
      chip.position.set(Math.cos(a) * r, 0.04, Math.sin(a) * r)
      chip.rotation.set(rand() * 3, rand() * 6, rand() * 3)
      chip.castShadow = true
      g.add(chip)
    }

    // 砧面上横放一截尚带余温的剑坯：暗红微光呼吸，点明「铸剑」意象而不触发刺眼过曝
    const hotSteelMat = new THREE.MeshStandardMaterial({
      color: 0x2d1410,
      metalness: 0.35,
      roughness: 0.62,
      emissive: 0xe84214,
      emissiveIntensity: 0.72,
    })
    const hotBlank = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.014, 0.046), hotSteelMat)
    hotBlank.position.set(0.02, 0.713, 0.01)
    hotBlank.rotation.y = 0.08
    this.hotSteelMat = hotSteelMat
    const glowTex = makeRadialTexture([
      [0, 'rgba(255,112,48,0.42)'],
      [0.45, 'rgba(210,54,22,0.14)'],
      [1, 'rgba(170,30,12,0)'],
    ])
    const forgeGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        opacity: 0.32,
      }),
    )
    forgeGlow.position.set(0.02, 0.76, 0.01)
    forgeGlow.scale.set(0.65, 0.34, 1)
    this.forgeGlow = forgeGlow

    g.add(stump, belly, waist, face, horn, hammerGrip, hammerHead, hotBlank, forgeGlow)
    // 砧旁一块垫石，避免整体像悬空
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.86, 0.1, 10), stone)
    pad.position.y = 0.05
    pad.receiveShadow = true
    g.add(pad)

    g.scale.setScalar(0.82)
    g.position.set(s.x, 0, s.z)
    g.rotation.y = s.yaw
    this.group.add(g)
  }

  // ---------- 传书 contact：挂灯笼的木杆 + 信箱 + 信鸽 ----------
  private buildPost(wood: THREE.Material, stone: THREE.Material) {
    const s = CAMP.post
    const g = new THREE.Group()

    // 基座
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.16, 8), stone)
    base.position.y = 0.08
    base.receiveShadow = true

    // 立杆 + 挑出的一臂
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 2.5, 7), wood)
    pole.position.y = 1.25
    pole.castShadow = true
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.78, 6), wood)
    arm.rotation.z = Math.PI / 2 - 0.12
    arm.position.set(-0.36, 2.34, 0)
    arm.castShadow = true
    // 斜撑
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.42, 6), wood)
    brace.rotation.z = -Math.PI / 4
    brace.position.set(-0.2, 2.16, 0)
    brace.castShadow = true

    this.addLantern(g, new THREE.Vector3(-0.72, 2.12, 0), 3.4)

    // 信箱：斜顶木盒 + 投信口
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.28), wood)
    box.position.set(0.28, 0.95, 0.16)
    box.castShadow = true
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.4, 8, 1, false, 0, Math.PI), wood)
    lid.rotation.set(0, 0, Math.PI / 2)
    lid.position.set(0.28, 1.1, 0.16)
    lid.castShadow = true
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.02), new THREE.MeshStandardMaterial({ color: 0x120f1c }))
    slot.position.set(0.28, 1.0, 0.305)
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.8, 6), wood)
    leg.position.set(0.28, 0.4, 0.16)
    leg.castShadow = true

    // 一只纸鸢：挂在杆侧
    const kite = new THREE.Group()
    const kiteMat = new THREE.MeshStandardMaterial({ color: 0x8f3247, roughness: 0.8, side: THREE.DoubleSide })
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.34), kiteMat)
    const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.3), kiteMat)
    tail.position.y = -0.3
    sail.rotation.z = Math.PI / 4
    sail.castShadow = true
    kite.add(sail, tail)
    kite.position.set(0.36, 1.76, 0.1)
    kite.rotation.y = 0.5
    markDynamic(kite)
    this.kite = kite
    g.add(kite)

    // 信鸽：蹲在信箱顶上，偶尔转头
    const feather = new THREE.MeshStandardMaterial({ color: 0xcfcbe0, roughness: 0.9, emissive: 0x1c1a2a, emissiveIntensity: 0.5 })
    const pigeon = new THREE.Group()
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), feather)
    body.scale.set(0.11, 0.075, 0.07)
    const tailFeather = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.06), feather)
    tailFeather.position.set(-0.12, 0.01, 0)
    tailFeather.rotation.z = 0.25
    const head = new THREE.Group()
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), feather)
    const beak = new THREE.Mesh(
      new THREE.ConeGeometry(0.009, 0.03, 5).rotateZ(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.6 }),
    )
    beak.position.set(0.042, -0.004, 0)
    head.add(skull, beak)
    head.position.set(0.09, 0.07, 0)
    for (const m of [body, tailFeather, skull]) m.castShadow = true
    pigeon.add(body, tailFeather, head)
    pigeon.position.set(0.28, 1.3, 0.16)
    pigeon.rotation.y = 0.9
    markDynamic(head)
    this.pigeonHead = head
    g.add(pigeon)

    g.add(base, pole, arm, brace, box, lid, slot, leg)
    g.scale.setScalar(0.78)
    g.position.set(s.x, 0, s.z)
    g.rotation.y = s.yaw
    this.group.add(g)
  }

  /** 纸灯笼：木柄吊环 + 纸面球 + 上下木盖 + 内部暖光 */
  private addLantern(parent: THREE.Group, at: THREE.Vector3, base: number) {
    const rib = new THREE.MeshStandardMaterial({ color: 0x2a1f1a, roughness: 0.9 })
    const hang = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 4), rib)
    hang.position.copy(at).add(new THREE.Vector3(0, 0.3, 0))
    const { globe, parts } = makeLanternParts(at)
    // 灯笼自己照亮纸面与脚下的地：距离短、衰减快，不影响整体曝光
    const light = new THREE.PointLight(0xffa055, base, 4.5, 2)
    light.position.copy(at)
    parent.add(hang, ...parts, light)
    this.lanterns.push({ light, globe, phase: this.lanterns.length * 2.1, base })
  }

  /** 灯笼呼吸式闪烁 + 剑坯余温 + 纸鸢轻摆 + 信鸽转头 */
  update(time: number) {
    for (const { light, globe, phase, base } of this.lanterns) {
      const f = 0.84 + 0.1 * Math.sin(time * 2.7 + phase) + 0.05 * Math.sin(time * 11.3 + phase * 1.7)
      light.intensity = base * f
      globe.material.emissiveIntensity = 1.25 * f + 0.35
    }
    if (this.hotSteelMat) {
      const heat = 0.85 + 0.15 * Math.sin(time * 1.9) + 0.06 * Math.sin(time * 4.7)
      this.hotSteelMat.emissiveIntensity = 0.72 * heat
      if (this.forgeGlow) this.forgeGlow.material.opacity = 0.28 * heat
    }
    if (this.kite) {
      this.kite.rotation.z = Math.sin(time * 1.45) * 0.09
      this.kite.rotation.y = 0.5 + Math.sin(time * 0.9 + 0.7) * 0.12
    }
    if (this.pigeonHead) {
      // 大部分时间静止，隔几秒转一下头
      const t = time % 5.3
      const turn = t < 0.35 ? Math.sin((t / 0.35) * Math.PI) : 0
      this.pigeonHead.rotation.y = Math.sin(Math.floor(time / 5.3) * 2.4) * 0.7 * (t < 2.6 ? 1 : 0) + turn * 0.25
      this.pigeonHead.position.y = 0.07 + Math.max(0, Math.sin(time * 3.1)) * 0.004
    }
  }
}
