import * as THREE from 'three'
import gsap from 'gsap'
import type { ModuleId } from '../config/modules'
import { HOME_POSE, JOINTS, type Joint, type Pose } from '../config/poses'

const DEG = Math.PI / 180
const UP = new THREE.Vector3(0, 1, 0)
const SWORD_LENGTH = 1.15

/** [起点, 终点, 起点半径, 终点半径] 锥形骨骼 */
const BONES: [Joint, Joint, number, number][] = [
  ['neck', 'chest', 0.056, 0.052],
  ['chest', 'hip', 0.052, 0.048],
  ['neck', 'elbowL', 0.045, 0.038],
  ['elbowL', 'handL', 0.038, 0.032],
  ['neck', 'elbowR', 0.045, 0.038],
  ['elbowR', 'handR', 0.038, 0.032],
  ['hip', 'kneeL', 0.048, 0.042],
  ['kneeL', 'footL', 0.042, 0.038],
  ['hip', 'kneeR', 0.048, 0.042],
  ['kneeR', 'footR', 0.042, 0.038],
]

const KNOBS: [Joint, number][] = [
  ['neck', 0.055],
  ['chest', 0.051],
  ['hip', 0.047],
  ['elbowL', 0.04],
  ['elbowR', 0.04],
  ['handL', 0.05],
  ['handR', 0.05],
  ['kneeL', 0.045],
  ['kneeR', 0.045],
  ['footL', 0.052],
  ['footR', 0.052],
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
      // 越靠近末端跟随越慢 -> 人物动作时布带被甩出去
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
 * 姿态是一组关节坐标，切换模块时由 GSAP 在两组坐标间补间。
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
  /** 随当前章节轻轻微调偏头角度（如走近「来历」时微微抬首迎客） */
  private headYaw = 0
  private headYawTarget = 0
  private headTiltBias = 0
  private headTiltTarget = 0

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
      m.scale.setScalar(r * 1.1)
      this.knobs.push(m)
      this.body.add(m)
    }

    // ---------- 头 + 斗笠 ----------
    const skull = cast(new THREE.Mesh(ballGeo, skin))
    skull.scale.set(0.13, 0.15, 0.13)
    skull.position.y = 0.01
    const hat = cast(
      new THREE.Mesh(
        new THREE.ConeGeometry(0.36, 0.21, 40, 1, true),
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
    hat.position.y = 0.13
    this.head.add(skull, hat)
    this.body.add(this.head)

    // ---------- 剑（局部 +Y 为剑身方向，原点在护手） ----------
    const bladeGeo = new THREE.BoxGeometry(0.04, SWORD_LENGTH, 0.009)
    bladeGeo.translate(0, SWORD_LENGTH / 2, 0)
    const blade = cast(
      new THREE.Mesh(
        bladeGeo,
        new THREE.MeshStandardMaterial({
          // 冷月下的剑光：metalness 收到 0.55、粗糙度放宽，避免掠射高光进辉光阈值后变成火炬
          color: 0xcdd3e2,
          metalness: 0.55,
          roughness: 0.34,
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
      flatShading: false
    })
    const guardGeo = new THREE.BoxGeometry(0.19, 0.032, 0.042)
    const guard = cast(new THREE.Mesh(guardGeo, skin))
    const grip = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.24, 8), dark))
    grip.position.y = -0.12
    const pommel = cast(new THREE.Mesh(ballGeo, skin))
    pommel.scale.setScalar(0.028)
    pommel.position.y = -0.25
    this.sword.add(blade, guard, grip, pommel)
    this.body.add(this.sword)

    // ---------- 红巾（挂在右肩，两条飘带从背后飘出） ----------
    const cloth = new THREE.MeshStandardMaterial({
      color: 0xb82530,
      metalness: 0,
      roughness: 0.85,
      side: THREE.DoubleSide,
      emissive: 0x000000,
      emissiveIntensity: 0,
    })
    this.collar = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 12), cloth))
    this.collar.rotation.z = Math.PI / 2
    this.body.add(this.collar)
    this.ribbons = [new Ribbon(14, 1.25, 0.1, 0.15, cloth), new Ribbon(11, 0.9, 0.07, -0.12, cloth)]

    this.group.add(this.body, ...this.ribbons.map((r) => r.mesh))
  }

  /** 主角只有一个姿态；保留补间接口，方便以后加动作 */
  setPose(pose: Pose = HOME_POSE) {
    if (!this.pose) {
      this.pose = { ...pose }
      return
    }
    this.tween?.kill()
    this.tween = gsap.to(this.pose, { ...pose, duration: 1, ease: 'power3.inOut' })
  }

  /** 切到不同模块时，剑客轻轻偏头回应（零额外开销，增添营地活气） */
  setModule(id: ModuleId) {
    if (id === 'about') {
      this.headYawTarget = -0.28
      this.headTiltTarget = 10
    } else if (id === 'blog') {
      this.headYawTarget = -0.35
      this.headTiltTarget = -4
    } else if (id === 'projects') {
      this.headYawTarget = 0.25
      this.headTiltTarget = 2
    } else {
      this.headYawTarget = 0
      this.headTiltTarget = 0
    }
  }

  /** lean: 鼠标带来的轻微转身（rad） */
  update(time: number, dt: number, lean: number) {
    const p = this.pose
    if (!p) return
    const J = this.joints
    for (const j of JOINTS) J[j].set(p[`${j}X`], p[`${j}Y`], p[`${j}Z`])

    // 呼吸：上身轻微起伏
    const b = Math.sin(time * 1.5) * 0.012
    J.neck.y += b
    J.head.y += b * 1.1
    J.elbowL.y += b * 0.6
    J.elbowR.y += b * 0.6

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
    this.headTiltBias += (this.headTiltTarget - this.headTiltBias) * ease

    this.head.position.copy(J.head)
    this.head.rotation.set(0, this.headYaw, -(p.tilt + this.headTiltBias) * DEG)

    this.dir.subVectors(J.tip, J.hilt).normalize()
    this.sword.position.copy(J.hilt)
    this.sword.quaternion.setFromUnitVectors(UP, this.dir)

    this.collar.position.lerpVectors(J.neck, J.elbowR, 0.25)

    this.body.rotation.y = p.yaw * DEG + lean

    // 红巾挂在右肩，两条飘带从背后飘出
    this.anchor.copy(this.collar.position).applyAxisAngle(UP, this.body.rotation.y)
    this.anchor.z += 0.08
    this.ribbons[0].update(this.anchor, time, dt)
    this.anchor.z -= 0.04
    this.ribbons[1].update(this.anchor, time, dt)
  }

  dispose() {
    this.tween?.kill()
  }
}
