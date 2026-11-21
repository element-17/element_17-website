import type { PerspectiveCamera } from 'three'
import { Vector3 } from 'three'
import type { ModuleId } from '../config/modules'
import { shotFor, type Shot } from '../config/shots'

const MOBILE = 768

/** 一次转场：起点、终点、时长、弧高 */
interface Transition {
  from: Shot
  to: Shot
  /** performance.now() 基准的起始时刻 */
  start: number
  /** 总时长（秒） */
  duration: number
  /** 途中相机抬起的高度（m），避免贴地平移时穿过篝火或陈设 */
  arc: number
}

/** 缓动：三次 inOut，起步和落定都很柔 */
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

const KEYS = Object.keys(shotFor('home', false)) as (keyof Shot)[]

interface Floater {
  el: HTMLElement
  k: number
}

/**
 * 营地内的镜头控制器
 * - 五个模块都在同一堆篝火旁：切换只是一次 1~1.6s 的推拉摇，位置与注视点同时补间，途中轻微抬高
 * - 鼠标叠加轻微视差（沿相机自身的左右 / 上下方向，强度随机位远近与 par 缩放）
 * - 补间由 update()（渲染循环）按真实时间驱动：渲染循环冻结时补间暂停，恢复后直接落位
 */
export class SceneTransitionController {
  readonly state: Shot = { ...shotFor('home', false) }
  readonly mouse = { x: 0, y: 0, tx: 0, ty: 0 }
  /** 当前目标模块 */
  current: ModuleId | null = null
  /** 当前转场进度 0~1（落定后恒为 1） */
  progress = 1

  private camera: PerspectiveCamera
  private transition: Transition | null = null
  private narrow = false
  private reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  private floaters: Floater[] = []
  private vignette: HTMLElement | null = null

  private pos = new Vector3()
  private target = new Vector3()
  private forward = new Vector3()
  private right = new Vector3()
  private up = new Vector3()

  constructor(camera: PerspectiveCamera, uiRoot: HTMLElement | null) {
    this.camera = camera
    this.narrow = window.innerWidth < MOBILE
    if (uiRoot) {
      const qa = (sel: string) => Array.from(uiRoot.querySelectorAll<HTMLElement>(sel))
      this.floaters = qa('[data-float]').map((el) => ({ el, k: Number(el.dataset.float) || 4 }))
      this.vignette = uiRoot.querySelector('[data-vignette]')
    }
    window.addEventListener('pointermove', this.onPointerMove, { passive: true })
  }

  goTo(id: ModuleId) {
    if (id === this.current) return
    const first = this.current === null
    this.current = id
    const to = shotFor(id, this.narrow)
    const s = this.state

    if (first) {
      Object.assign(s, to)
      this.transition = null
      this.progress = 1
      return
    }

    const d = Math.hypot(to.px - s.px, to.py - s.py, to.pz - s.pz)
    this.transition = {
      from: { ...s },
      to: { ...to },
      start: performance.now(),
      duration: this.reduceMotion ? 0.4 : Math.min(1.65, Math.max(1.05, 0.95 + d * 0.12)),
      arc: this.reduceMotion ? 0 : Math.min(0.45, d * 0.07),
    }
    this.progress = 0
  }

  /** 仅供自动化测试：立刻结束当前转场，跳到目标机位 */
  forceSettle() {
    if (this.transition) {
      Object.assign(this.state, this.transition.to)
      this.transition = null
      this.progress = 1
    }
  }

  update(width: number, height: number) {
    const m = this.mouse
    m.x += (m.tx - m.x) * 0.06
    m.y += (m.ty - m.y) * 0.06

    // 横竖屏 / 窗口跨过断点：目标机位换成对应版本
    const narrow = width < MOBILE
    if (narrow !== this.narrow) {
      this.narrow = narrow
      if (this.current) {
        const to = shotFor(this.current, narrow)
        if (this.transition) this.transition.to = { ...to }
        else Object.assign(this.state, to)
      }
    }

    this.updateTransition()
    const s = this.state
    const cam = this.camera

    // 视差：沿相机自己的右 / 上方向平移，近景按距离和 par 收小
    this.pos.set(s.px, s.py, s.pz)
    this.target.set(s.tx, s.ty, s.tz)
    this.forward.subVectors(this.target, this.pos)
    const dist = this.forward.length() || 1
    this.forward.divideScalar(dist)
    this.right.crossVectors(this.forward, cam.up.set(0, 1, 0)).normalize()
    this.up.crossVectors(this.right, this.forward)
    const k = Math.min(1, dist / 4.6) * s.par
    this.pos.addScaledVector(this.right, m.x * 0.3 * k).addScaledVector(this.up, m.y * 0.2 * k)
    this.target.addScaledVector(this.right, m.x * 0.3 * k).addScaledVector(this.up, m.y * 0.2 * k)

    cam.position.copy(this.pos)
    cam.lookAt(this.target)
    cam.fov = s.fov
    cam.aspect = width / height
    cam.setViewOffset(width, height, s.shift * width, s.shiftY * height, width, height)
    cam.updateMatrixWorld()

    for (const { el: node, k: f } of this.floaters) {
      node.style.transform = `translate3d(${(-m.x * f).toFixed(2)}px,${(-m.y * f * 0.6).toFixed(2)}px,0)`
    }
    if (this.vignette) this.vignette.style.opacity = s.vig.toFixed(3)
  }

  destroy() {
    this.transition = null
    window.removeEventListener('pointermove', this.onPointerMove)
  }

  /** 按真实时间推进转场；渲染循环恢复后补间一步到位，不会停留在中间帧 */
  private updateTransition() {
    const tr = this.transition
    if (!tr) return
    const s = this.state
    const t = Math.min(1, (performance.now() - tr.start) / 1000 / tr.duration)
    this.progress = t

    if (t >= 1) {
      Object.assign(s, tr.to)
      this.transition = null
      return
    }

    const k = easeInOut(t)
    for (const key of KEYS) s[key] = tr.from[key] + (tr.to[key] - tr.from[key]) * k
    s.py += tr.arc * Math.sin(Math.PI * t)
  }

  private onPointerMove = (e: PointerEvent) => {
    if (this.reduceMotion || e.pointerType === 'touch') return
    this.mouse.tx = (e.clientX / window.innerWidth) * 2 - 1
    this.mouse.ty = (e.clientY / window.innerHeight) * 2 - 1
  }
}
