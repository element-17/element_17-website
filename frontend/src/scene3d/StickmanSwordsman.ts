import * as THREE from 'three'
import gsap from 'gsap'
import type { ModuleId } from '../config/modules'
import { HOME_POSE, JOINTS, type Joint, type Pose } from '../config/poses'

const DEG = Math.PI / 180
const UP = new THREE.Vector3(0, 1, 0)
const SWORD_LENGTH = 0.88

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

  update(anchor: THREE.Vector3, time: number, dt: number) {
    const { segs, pts, target, wind, side, w } = this
    for (let i = 0; i <= segs; i++) {
      const f = i / segs
      target
        .copy(anchor)
        .addScaledVector(wind, i * this.segLen)
        .addScaledVector(UP, Math.sin(time * 3.1 - i * 0.75 + this.phase) * 0.09 * f - 0.22 * f * f)
        .addScaledVector(side, Math.sin(time * 2.3 - i * 0.55 + this.phase * 1.7) * 0.12 * f)
      if (!this.started || i === 0) pts[i].copy(target)
      else pts[i].lerp(target, 1 - Math.exp(-dt * (16 - 11 * f)))
    }
    this.started = true

    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i <= segs; i++) {
      const f = i / segs
      const twist = Math.sin(time * 1.7 - i * 0.45 + this.phase) * 0.7
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
  private dir = new THREE.Vector3()
  private anchor = new THREE.Vector3()
  private tween: gsap.core.Tween | null = null
  /** 随当前章节轻轻微调头部朝向与压檐角度 */
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

    // ---------- 头 + 斗笠（YXZ 顺序确保转头与低眉压檐自然叠加） ----------
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
    this.head.add(skull, hat)
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

    this.group.add(this.body, ...this.ribbons.map((r) => r.mesh))
  }

  /** 主角姿态接口 */
  setPose(pose: Pose = HOME_POSE) {
    if (!this.pose) {
      this.pose = { ...pose }
      return
    }
    this.tween?.kill()
    this.tween = gsap.to(this.pose, { ...pose, duration: 1, ease: 'power3.inOut' })
  }

  /** 切到不同模块时，剑客轻轻转首与抬/压帽檐回应 */
  setModule(id: ModuleId) {
    if (id === 'about') {
      // 访客走近「来历」：微微抬首面向来人
      this.headYawTarget = -0.26
      this.headPitchTarget = 0.04
    } else if (id === 'blog') {
      // 望向篝火与古卷方向
      this.headYawTarget = -0.78
      this.headPitchTarget = 0.24
    } else if (id === 'projects') {
      this.headYawTarget = 0.12
      this.headPitchTarget = 0.1
    } else {
      // 归处 / 传书：微低帽檐，沉静守炉
      this.headYawTarget = -0.58
      this.headPitchTarget = 0.18
    }
  }

  /** lean: 鼠标带来的轻微转身（rad） */
  update(time: number, dt: number, lean: number) {
    const p = this.pose
    if (!p) return
    const J = this.joints
    for (const j of JOINTS) J[j].set(p[`${j}X`], p[`${j}Y`], p[`${j}Z`])

    // 呼吸：上身轻微起伏（双手按在剑柄上不动，肩肘随之轻微呼吸）
    const b = Math.sin(time * 1.5) * 0.01
    J.neck.y += b
    J.head.y += b * 1.1
    J.shoulderL.y += b * 0.9
    J.shoulderR.y += b * 0.9
    J.elbowL.y += b * 0.45
    J.elbowR.y += b * 0.45

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

    this.dir.subVectors(J.tip, J.hilt).normalize()
    this.sword.position.copy(J.hilt)
    this.sword.quaternion.setFromUnitVectors(UP, this.dir)

    // 红巾围领贴在颈根处，飘带从颈后右侧迎风飘出
    this.collar.position.lerpVectors(J.neck, J.chest, 0.16)

    this.body.rotation.y = p.yaw * DEG + lean

    this.anchor.copy(this.collar.position).add(new THREE.Vector3(0.05, 0, -0.04)).applyAxisAngle(UP, this.body.rotation.y)
    this.ribbons[0].update(this.anchor, time, dt)
    this.anchor.y -= 0.02
    this.anchor.z -= 0.03
    this.ribbons[1].update(this.anchor, time, dt)
  }

  dispose() {
    this.tween?.kill()
  }
}
