import * as THREE from 'three'
import gsap from 'gsap'
import type { ModuleId } from '../config/modules'
import { FISHING_POSE, HOME_POSE, JOINTS, SNOW_WARM_POSE, type Joint, type Pose } from '../config/poses'
import { CAMP } from '../config/shots'
import type { WeatherKind } from '../config/weather'
import { WATER_Y, groundHeight } from './River'
import { makeRadialTexture } from './textures'

const DEG = Math.PI / 180
const UP = new THREE.Vector3(0, 1, 0)
const SWORD_LENGTH = 0.88
const BREATH_COUNT = 3

/** [起点, 终点, 起点半径, 终点半径] 锥形骨骼 */
const BONES: [Joint, Joint, number, number][] = [
  ['neck', 'chest', 0.054, 0.05],
  ['chest', 'hip', 0.05, 0.048],
  ['neck', 'shoulderL', 0.042, 0.042],
  ['neck', 'shoulderR', 0.042, 0.042],
  ['shoulderL', 'elbowL', 0.043, 0.036],
  ['elbowL', 'handL', 0.036, 0.031],
  ['shoulderR', 'elbowR', 0.043, 0.036],
  ['elbowR', 'handR', 0.036, 0.031],
  ['hip', 'kneeL', 0.047, 0.041],
  ['kneeL', 'footL', 0.041, 0.037],
  ['hip', 'kneeR', 0.047, 0.041],
  ['kneeR', 'footR', 0.041, 0.037],
]

const KNOBS: [Joint, number][] = [
  ['neck', 0.052],
  ['chest', 0.049],
  ['hip', 0.047],
  ['shoulderL', 0.042],
  ['shoulderR', 0.042],
  ['elbowL', 0.038],
  ['elbowR', 0.038],
  ['handL', 0.046],
  ['handR', 0.046],
  ['kneeL', 0.044],
  ['kneeR', 0.044],
  ['footL', 0.05],
  ['footR', 0.05],
]

/** 随风飘动的布带：一串带惯性的点 + 每帧重建的条带网格 */
class Ribbon {
  readonly mesh: THREE.Mesh
  private pts: THREE.Vector3[] = []
  private started = false
  private segs: number
  private segLen: number
  private width: number
  private phase: number
  private wind = new THREE.Vector3(0.96, 0.06, 0.27).normalize()
  private side = new THREE.Vector3()
  private target = new THREE.Vector3()
  private w = new THREE.Vector3()

  constructor(segs: number, length: number, width: number, phase: number, material: THREE.Material) {
    this.segs = segs
    this.segLen = length / segs
    this.width = width
    this.phase = phase
    this.side.crossVectors(this.wind, UP).normalize()
    for (let i = 0; i <= segs; i++) this.pts.push(new THREE.Vector3())

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((segs + 1) * 6), 3))
    const index: number[] = []
    for (let i = 0; i < segs; i++) {
      const a = i * 2
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    geo.setIndex(index)
    this.mesh = new THREE.Mesh(geo, material)
    this.mesh.frustumCulled = false
    this.mesh.castShadow = true
  }

  reset() {
    this.started = false
  }

  update(anchor: THREE.Vector3, time: number, dt: number, windFactor = 1) {
    const { segs, pts, target, wind, side, w } = this
    const freq = 1 + (windFactor - 1) * 0.45
    const amp = 1 + (windFactor - 1) * 0.35
    for (let i = 0; i <= segs; i++) {
      const f = i / segs
      target
        .copy(anchor)
        .addScaledVector(wind, i * this.segLen)
        .addScaledVector(UP, Math.sin(time * 3.1 * freq - i * 0.75 + this.phase) * 0.09 * amp * f - (0.22 / Math.sqrt(windFactor)) * f * f)
        .addScaledVector(side, Math.sin(time * 2.3 * freq - i * 0.55 + this.phase * 1.7) * 0.12 * amp * f)
      if (!this.started || i === 0) pts[i].copy(target)
      else pts[i].lerp(target, 1 - Math.exp(-dt * (16 - 11 * f)))
    }
    this.started = true

    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i <= segs; i++) {
      const f = i / segs
      const twist = Math.sin(time * 1.7 * freq - i * 0.45 + this.phase) * 0.7
      const half = this.width * (1 - f * 0.55) * 0.5
      w.copy(UP).multiplyScalar(Math.cos(twist)).addScaledVector(side, Math.sin(twist)).multiplyScalar(half)
      const p = pts[i]
      pos.setXYZ(i * 2, p.x + w.x, p.y + w.y, p.z + w.z)
      pos.setXYZ(i * 2 + 1, p.x - w.x, p.y - w.y, p.z - w.z)
    }
    pos.needsUpdate = true
    this.mesh.geometry.computeVertexNormals()
  }
}

/**
 * 3D 火柴人剑客：圆柱肢体 + 球形关节 + 斗笠 + 长剑 + 红巾。
 * 随天气自动切换活动：
 * - 晴天/阴雾：营地倚石抱剑守炉；
 * - 雨天：移步河畔青石执竿垂钓（竹钓竿 + 鱼线 + 浮漂 + 咬钩水纹），长剑插立身旁；
 * - 下雪：靠近旺燃篝火蹲坐烤火，斗笠积雪、口呵白气。
 */
export class StickmanSwordsman {
  readonly group = new THREE.Group()
  private body = new THREE.Group()
  private pose: Pose | null = null
  private joints = {} as Record<Joint, THREE.Vector3>
  private bones: THREE.Mesh[] = []
  private knobs: THREE.Mesh[] = []
  private head = new THREE.Group()
  private sword = new THREE.Group()
  private collar: THREE.Mesh
  private ribbons: Ribbon[]

  // 斗笠积雪层
  private hatSnow: THREE.Mesh
  private hatSnowMat: THREE.MeshStandardMaterial

  // 雨天垂钓道具：弯曲竹钓竿 + 鱼线 + 红白浮漂 + 水面涟漪环
  private fishingRod = new THREE.Group()
  private rodTipLocal = new THREE.Vector3()
  private fishingLine: THREE.Line
  private linePositions: Float32Array
  private bobber = new THREE.Group()
  private bobberRipple: THREE.Mesh
  private bobberRippleMat: THREE.MeshBasicMaterial

  // 雪天寒气白雾
  private breathSprites: THREE.Sprite[] = []

  private weather: WeatherKind = 'clear'
  private activeModule: ModuleId = 'home'
  private dir = new THREE.Vector3()
  private anchor = new THREE.Vector3()
  private tmpTip = new THREE.Vector3()
  private tmpBob = new THREE.Vector3()
  private tween: gsap.core.Tween | null = null

  /** 随当前章节与天气微调头部朝向与压檐角度 */
  private headYaw = -0.58
  private headYawTarget = -0.58
  private headPitch = 0.18
  private headPitchTarget = 0.18

  constructor() {
    for (const j of JOINTS) this.joints[j] = new THREE.Vector3()

    const skin = new THREE.MeshStandardMaterial({
      color: 0xd4dce8,
      metalness: 0.05,
      roughness: 0.85,
      emissive: 0x1a2438,
      emissiveIntensity: 0.15,
      flatShading: false,
    })

    const boneGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true)
    const ballGeo = new THREE.SphereGeometry(1, 16, 12)
    const cast = <T extends THREE.Mesh>(m: T) => {
      m.castShadow = true
      return m
    }

    for (let i = 0; i < BONES.length; i++) {
      const m = cast(new THREE.Mesh(boneGeo, skin))
      this.bones.push(m)
      this.body.add(m)
    }
    for (const [, r] of KNOBS) {
      const m = cast(new THREE.Mesh(ballGeo, skin))
      m.scale.setScalar(r * 1.08)
      this.knobs.push(m)
      this.body.add(m)
    }

    // ---------- 头 + 斗笠 + 斗笠积雪 ----------
    this.head.rotation.order = 'YXZ'
    const skull = cast(new THREE.Mesh(ballGeo, skin))
    skull.scale.set(0.125, 0.14, 0.125)
    skull.position.y = 0.01
    const hat = cast(
      new THREE.Mesh(
        new THREE.ConeGeometry(0.36, 0.2, 40, 1, true),
        new THREE.MeshStandardMaterial({
          color: 0xa8b2c8,
          metalness: 0,
          roughness: 0.95,
          side: THREE.DoubleSide,
          emissive: 0x000000,
          emissiveIntensity: 0,
          flatShading: false,
        }),
      ),
    )
    hat.position.y = 0.125

    this.hatSnowMat = new THREE.MeshStandardMaterial({
      color: 0xeef4ff,
      metalness: 0,
      roughness: 0.92,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      emissive: 0x26324a,
      emissiveIntensity: 0.22,
    })
    this.hatSnow = new THREE.Mesh(new THREE.ConeGeometry(0.355, 0.195, 36, 1, true), this.hatSnowMat)
    this.hatSnow.position.y = 0.136
    this.hatSnow.visible = false

    this.head.add(skull, hat, this.hatSnow)
    this.body.add(this.head)

    // ---------- 剑（局部 +Y 为剑身方向，原点在护手，-Y 为剑柄与剑首） ----------
    const bladeGeo = new THREE.BoxGeometry(0.036, SWORD_LENGTH, 0.009)
    bladeGeo.translate(0, SWORD_LENGTH / 2, 0)
    const blade = cast(
      new THREE.Mesh(
        bladeGeo,
        new THREE.MeshStandardMaterial({
          color: 0xcdd3e2,
          metalness: 0.42,
          roughness: 0.52,
          emissive: 0x000000,
          emissiveIntensity: 0,
          flatShading: false,
        }),
      ),
    )
    const dark = new THREE.MeshStandardMaterial({
      color: 0x1a1f2e,
      metalness: 0.1,
      roughness: 0.9,
      flatShading: false,
    })
    const guardGeo = new THREE.BoxGeometry(0.16, 0.026, 0.036)
    const guard = cast(new THREE.Mesh(guardGeo, skin))
    const grip = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 8), dark))
    grip.position.y = -0.115
    const pommel = cast(new THREE.Mesh(ballGeo, skin))
    pommel.scale.setScalar(0.026)
    pommel.position.y = -0.235
    this.sword.add(blade, guard, grip, pommel)
    this.body.add(this.sword)

    // ---------- 竹钓竿（局部原点在握柄尾端，沿 -Z 与 +Y 优雅弧形探向河面） ----------
    const bambooMat = new THREE.MeshStandardMaterial({
      color: 0x8f7a52,
      roughness: 0.82,
      emissive: 0x261d10,
      emissiveIntensity: 0.22,
    })
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x2a1d19, roughness: 0.92 })
    // 握柄段
    const rodHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.019, 0.42, 8), gripMat)
    rodHandle.rotation.x = Math.PI / 2 - 0.52
    rodHandle.position.set(0, 0.08, -0.15)
    rodHandle.castShadow = true
    this.fishingRod.add(rodHandle)

    // 弯曲竹竿主干（局部空间从握柄前端延伸约 2.75m，末端自然微垂）
    const rodPts = [
      new THREE.Vector3(0, 0.14, -0.28),
      new THREE.Vector3(0, 0.62, -1.05),
      new THREE.Vector3(0, 0.92, -1.85),
      new THREE.Vector3(0, 0.98, -2.42),
      new THREE.Vector3(0, 0.84, -2.82),
    ]
    const rodCurve = new THREE.CatmullRomCurve3(rodPts)
    const tubeGeo = new THREE.TubeGeometry(rodCurve, 22, 0.014, 6, false)
    // 让竿身从粗到细逐渐收尖
    const tPos = tubeGeo.attributes.position as THREE.BufferAttribute
    const center = new THREE.Vector3()
    const vert = new THREE.Vector3()
    for (let i = 0; i < tPos.count; i++) {
      const segIdx = Math.floor(i / 7)
      const frac = Math.min(1, segIdx / 22)
      rodCurve.getPointAt(frac, center)
      vert.fromBufferAttribute(tPos, i).sub(center)
      const taper = THREE.MathUtils.lerp(1.0, 0.28, frac)
      vert.multiplyScalar(taper).add(center)
      tPos.setXYZ(i, vert.x, vert.y, vert.z)
    }
    tubeGeo.computeVertexNormals()
    const rodShaft = new THREE.Mesh(tubeGeo, bambooMat)
    rodShaft.castShadow = true
    this.fishingRod.add(rodShaft)

    // 几道细竹节
    for (const frac of [0.22, 0.45, 0.68]) {
      const pt = rodCurve.getPointAt(frac)
      const tan = rodCurve.getTangentAt(frac)
      const knot = new THREE.Mesh(new THREE.TorusGeometry(0.015 * (1 - frac * 0.55), 0.003, 5, 8), gripMat)
      knot.position.copy(pt)
      knot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan)
      this.fishingRod.add(knot)
    }
    this.rodTipLocal.copy(rodPts[rodPts.length - 1])
    this.fishingRod.visible = false
    this.body.add(this.fishingRod)

    // ---------- 鱼线 + 红白浮漂 + 水面波纹圈（挂在 group 下，坐标便于对齐河面 WATER_Y） ----------
    this.linePositions = new Float32Array(12 * 3)
    const lineGeo = new THREE.BufferGeometry()
    lineGeo.setAttribute('position', new THREE.BufferAttribute(this.linePositions, 3))
    this.fishingLine = new THREE.Line(
      lineGeo,
      new THREE.LineBasicMaterial({
        color: 0xdce6fa,
        transparent: true,
        opacity: 0.62,
      }),
    )
    this.fishingLine.frustumCulled = false
    this.fishingLine.visible = false

    const bobRed = new THREE.Mesh(
      new THREE.ConeGeometry(0.022, 0.08, 8),
      new THREE.MeshStandardMaterial({
        color: 0xd6363f,
        emissive: 0x8c1c24,
        emissiveIntensity: 0.75,
        roughness: 0.45,
      }),
    )
    bobRed.position.y = 0.045
    const bobWhite = new THREE.Mesh(
      new THREE.SphereGeometry(0.024, 8, 8),
      new THREE.MeshStandardMaterial({
        color: 0xf0f4ff,
        emissive: 0x455068,
        emissiveIntensity: 0.4,
        roughness: 0.5,
      }),
    )
    bobWhite.scale.set(1, 1.35, 1)
    const bobAntenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, 0.12, 5),
      new THREE.MeshBasicMaterial({ color: 0xffc66e }),
    )
    bobAntenna.position.y = 0.095
    this.bobber.add(bobRed, bobWhite, bobAntenna)
    this.bobber.visible = false

    this.bobberRippleMat = new THREE.MeshBasicMaterial({
      color: 0xd6e4ff,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    this.bobberRipple = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.13, 24), this.bobberRippleMat)
    this.bobberRipple.rotation.x = -Math.PI / 2
    this.bobberRipple.visible = false

    // ---------- 雪天哈气白雾 ----------
    const breathTex = makeRadialTexture([
      [0, 'rgba(236,244,255,0.48)'],
      [0.5, 'rgba(220,232,250,0.16)'],
      [1, 'rgba(210,224,245,0)'],
    ], 64)
    for (let i = 0; i < BREATH_COUNT; i++) {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: breathTex,
          transparent: true,
          depthWrite: false,
          opacity: 0,
        }),
      )
      sp.visible = false
      this.breathSprites.push(sp)
      this.body.add(sp)
    }

    // ---------- 红巾（围在颈间，两条飘带从背后迎风飘出） ----------
    const cloth = new THREE.MeshStandardMaterial({
      color: 0xb82530,
      metalness: 0,
      roughness: 0.85,
      side: THREE.DoubleSide,
      emissive: 0x000000,
      emissiveIntensity: 0,
    })
    this.collar = cast(new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.024, 8, 18), cloth))
    this.collar.rotation.x = Math.PI / 2
    this.body.add(this.collar)
    this.ribbons = [new Ribbon(14, 1.25, 0.1, 0.15, cloth), new Ribbon(11, 0.9, 0.07, -0.12, cloth)]

    this.group.add(
      this.body,
      this.fishingLine,
      this.bobber,
      this.bobberRipple,
      ...this.ribbons.map((r) => r.mesh),
    )
  }

  /** 主角姿态接口 */
  setPose(pose: Pose = HOME_POSE, immediate = false) {
    if (!this.pose || immediate) {
      this.tween?.kill()
      this.pose = { ...pose }
      return
    }
    this.tween?.kill()
    this.tween = gsap.to(this.pose, { ...pose, duration: 0.95, ease: 'power3.inOut' })
  }

  /** 切到不同模块时，剑客轻轻转首与抬/压帽檐回应 */
  setModule(id: ModuleId) {
    this.activeModule = id
    this.syncHeadTargets()
  }

  /** 随天气切换位置与活动（晴/阴倚石守炉；雨天河畔垂钓；雪天围炉烤火） */
  setWeather(kind: WeatherKind, immediate = false) {
    const prevSpot = this.spotFor(this.weather)
    const nextSpot = this.spotFor(kind)
    this.weather = kind

    const moved = prevSpot !== nextSpot || immediate
    if (nextSpot === 'fishing') {
      const y = groundHeight(CAMP.fishing.x, CAMP.fishing.z)
      this.group.position.set(CAMP.fishing.x, y, CAMP.fishing.z)
      this.setPose(FISHING_POSE, moved)
    } else if (nextSpot === 'snow') {
      this.group.position.set(CAMP.snowHero.x, 0, CAMP.snowHero.z)
      this.setPose(SNOW_WARM_POSE, moved)
    } else {
      this.group.position.set(CAMP.hero.x, 0, CAMP.hero.z)
      this.setPose(HOME_POSE, moved)
    }

    if (moved) {
      for (const r of this.ribbons) r.reset()
    }
    this.syncHeadTargets()
  }

  /** 当前人物交互焦点世界坐标（用于点击主角切至「来历」） */
  getFocusWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    if (this.weather === 'rain') {
      return out.set(CAMP.fishing.x, groundHeight(CAMP.fishing.x, CAMP.fishing.z) + 0.65, CAMP.fishing.z - 0.1)
    }
    if (this.weather === 'snow') {
      return out.set(CAMP.snowHero.x, 0.72, CAMP.snowHero.z)
    }
    return out.set(CAMP.hero.x + 0.35, 0.85, CAMP.hero.z - 0.1)
  }

  private spotFor(kind: WeatherKind): 'home' | 'fishing' | 'snow' {
    if (kind === 'rain') return 'fishing'
    if (kind === 'snow') return 'snow'
    return 'home'
  }

  private syncHeadTargets() {
    const id = this.activeModule
    if (this.weather === 'rain') {
      // 垂钓时低眉凝视浮漂，切到「来历」时微微偏首
      this.headYawTarget = id === 'about' ? -0.34 : 0.04
      this.headPitchTarget = id === 'about' ? 0.16 : 0.34
      return
    }
    if (this.weather === 'snow') {
      // 烤火时望向火堆，切到「来历」时略微抬头迎客
      this.headYawTarget = id === 'about' ? -0.45 : 0.02
      this.headPitchTarget = id === 'about' ? 0.08 : 0.28
      return
    }
    if (id === 'about') {
      this.headYawTarget = -0.26
      this.headPitchTarget = 0.04
    } else if (id === 'blog') {
      this.headYawTarget = -0.78
      this.headPitchTarget = 0.24
    } else if (id === 'projects') {
      this.headYawTarget = 0.12
      this.headPitchTarget = 0.1
    } else {
      this.headYawTarget = -0.58
      this.headPitchTarget = 0.18
    }
  }

  /** lean: 鼠标带来的轻微转身（rad） */
  update(time: number, dt: number, lean: number, wind = 1, snow = 0) {
    const p = this.pose
    if (!p) return
    const J = this.joints
    for (const j of JOINTS) J[j].set(p[`${j}X`], p[`${j}Y`], p[`${j}Z`])

    // 呼吸：上身轻微起伏
    const b = Math.sin(time * 1.5) * 0.01
    J.neck.y += b
    J.head.y += b * 1.1
    J.shoulderL.y += b * 0.9
    J.shoulderR.y += b * 0.9
    J.elbowL.y += b * 0.45
    J.elbowR.y += b * 0.45

    // 雪天烤火：双手在火光前轻轻搓动取暖
    if (this.weather === 'snow') {
      const rub = Math.sin(time * 3.8) * 0.018
      const lift = Math.sin(time * 1.9) * 0.012
      J.handL.y += lift + rub * 0.45
      J.handR.y += lift - rub * 0.45
      J.handL.x += Math.sin(time * 3.8) * 0.012
      J.handR.x -= Math.sin(time * 3.8) * 0.012
    }

    // 雨天垂钓：周期性轻提竿/鱼咬钩颤动
    const isFishing = this.weather === 'rain'
    let nibble = 0
    if (isFishing) {
      const cycle = time % 7.4
      if (cycle > 5.4 && cycle < 6.5) {
        const u = (cycle - 5.4) / 1.1
        nibble = Math.sin(u * Math.PI * 3) * Math.sin(u * Math.PI)
      }
      const swayY = Math.sin(time * 1.1) * 0.012 + nibble * 0.016
      J.handL.y += swayY * 0.5
      J.handR.y += swayY
      J.elbowR.y += swayY * 0.6
    }

    BONES.forEach(([from, to, r1, r2], i) => {
      const mesh = this.bones[i]
      const a = J[from]
      this.dir.subVectors(J[to], a)
      const len = this.dir.length() || 0.0001
      mesh.position.copy(a).addScaledVector(this.dir, 0.5)
      mesh.quaternion.setFromUnitVectors(UP, this.dir.divideScalar(len))
      mesh.scale.set(r1, len, r2)
    })
    KNOBS.forEach(([j], i) => this.knobs[i].position.copy(J[j]))

    const ease = 1 - Math.exp(-dt * 3.5)
    this.headYaw += (this.headYawTarget - this.headYaw) * ease
    this.headPitch += (this.headPitchTarget - this.headPitch) * ease

    this.head.position.copy(J.head)
    this.head.rotation.set(this.headPitch, this.headYaw, -p.tilt * DEG)

    // 斗笠积雪随降雪逐渐覆白
    this.hatSnow.visible = snow > 0.03
    this.hatSnowMat.opacity = Math.min(0.92, snow * 0.92)

    this.dir.subVectors(J.tip, J.hilt).normalize()
    this.sword.position.copy(J.hilt)
    this.sword.quaternion.setFromUnitVectors(UP, this.dir)

    // 红巾围领贴在颈根处
    this.collar.position.lerpVectors(J.neck, J.chest, 0.16)
    this.body.rotation.y = p.yaw * DEG + lean

    // ---------- 雨天钓竿、鱼线、浮漂与水面咬钩涟漪 ----------
    this.fishingRod.visible = isFishing
    this.fishingLine.visible = isFishing
    this.bobber.visible = isFishing
    this.bobberRipple.visible = isFishing
    if (isFishing) {
      // 竿尾在左手，竿身顺手势方向探向河面
      this.fishingRod.position.copy(J.handL).add(new THREE.Vector3(0, -0.04, 0.08))
      this.fishingRod.rotation.set(
        Math.sin(time * 0.85) * 0.022 - nibble * 0.055,
        Math.sin(time * 0.45) * 0.035,
        Math.sin(time * 1.15) * 0.015,
      )
      this.body.updateMatrixWorld(true)

      // 把竿尖坐标转到 group 局部空间，确保鱼线严丝合缝连到水面浮漂
      this.tmpTip.copy(this.rodTipLocal).applyMatrix4(this.fishingRod.matrix).applyAxisAngle(UP, this.body.rotation.y)
      const waterLocalY = WATER_Y - this.group.position.y
      const bobDip = Math.sin(time * 2.4) * 0.014 - Math.max(0, nibble) * 0.075
      this.tmpBob.set(
        this.tmpTip.x + Math.sin(time * 0.9) * 0.025,
        waterLocalY + bobDip,
        this.tmpTip.z - 0.12 + Math.cos(time * 0.75) * 0.02,
      )
      this.bobber.position.copy(this.tmpBob)
      this.bobber.rotation.z = Math.sin(time * 2.1) * 0.12 + nibble * 0.25

      // 轻微垂弧的鱼线（12 段）
      const segs = 11
      const slack = 0.055 - Math.abs(nibble) * 0.035
      for (let i = 0; i <= segs; i++) {
        const f = i / segs
        const lx = THREE.MathUtils.lerp(this.tmpTip.x, this.tmpBob.x, f)
        const ly = THREE.MathUtils.lerp(this.tmpTip.y, this.tmpBob.y + 0.08, f) - Math.sin(f * Math.PI) * slack
        const lz = THREE.MathUtils.lerp(this.tmpTip.z, this.tmpBob.z, f)
        this.linePositions[i * 3] = lx
        this.linePositions[i * 3 + 1] = ly
        this.linePositions[i * 3 + 2] = lz
      }
      ;(this.fishingLine.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true

      // 浮漂周围周期性扩开的水波涟漪
      const rip = (time * (0.55 + Math.abs(nibble) * 0.75)) % 1
      this.bobberRipple.position.set(this.tmpBob.x, waterLocalY + 0.012, this.tmpBob.z)
      const rScale = 0.55 + rip * (2.6 + Math.abs(nibble) * 2.2)
      this.bobberRipple.scale.set(rScale, rScale, 1)
      this.bobberRippleMat.opacity = (1 - rip) * (0.28 + Math.abs(nibble) * 0.35)
    }

    // ---------- 雪天寒气哈气 ----------
    const showBreath = snow > 0.45
    for (let i = 0; i < this.breathSprites.length; i++) {
      const sp = this.breathSprites[i]
      sp.visible = showBreath
      if (!showBreath) continue
      const cycle = (time * 0.32 + i * 0.14) % 1
      const active = cycle < 0.55
      if (!active) {
        sp.material.opacity = 0
        continue
      }
      const u = cycle / 0.55
      sp.position.set(
        J.head.x + Math.sin(time + i) * 0.03 * u,
        J.head.y - 0.04 + u * 0.24,
        J.head.z - 0.14 - u * 0.28,
      )
      const sc = 0.08 + u * 0.24
      sp.scale.set(sc, sc, 1)
      sp.material.opacity = Math.sin(u * Math.PI) * 0.34 * snow
    }

    // 红巾飘带
    const ribbonOffset = this.weather === 'rain' || this.weather === 'snow'
      ? new THREE.Vector3(0.03, 0, 0.06)
      : new THREE.Vector3(0.05, 0, -0.04)
    this.anchor.copy(this.collar.position).add(ribbonOffset).applyAxisAngle(UP, this.body.rotation.y)
    this.ribbons[0].update(this.anchor, time, dt, wind)
    this.anchor.y -= 0.02
    this.anchor.z -= 0.03
    this.ribbons[1].update(this.anchor, time, dt, wind)
  }

  dispose() {
    this.tween?.kill()
  }
}
