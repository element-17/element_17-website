import type { Camera } from 'three'
import { Vector3 } from 'three'

/**
 * 把一块普通的 DOM 面板「贴」到 3D 场景里的一个矩形上。
 *
 * 卷面本身只是一张没有字的纸（WebGL 里只画纸纹和界栏），文章列表是叠在画布上的 HTML：
 * 每帧把卷面四个角投影到屏幕上，解出 DOM 矩形 -> 屏幕四边形的单应矩阵，写成 CSS matrix3d。
 * 文字由浏览器排版和栅格化：清晰、可选中、可点击、可被读屏器读到，GPU 不用多画一个字。
 */
export class SheetProjector {
  /** 0~1：当前不透明度 */
  private alpha = 0
  private el: HTMLElement | null
  private corners: Vector3[]
  private v = new Vector3()
  private pts = new Float64Array(8)
  private w = 1
  private h = 1
  private ro: ResizeObserver | null = null
  private shown = false

  /** corners：世界坐标下卷面的 左上 / 右上 / 右下 / 左下（从相机看过去） */
  constructor(el: HTMLElement | null, corners: Vector3[]) {
    this.el = el
    this.corners = corners
    if (el) {
      this.w = el.offsetWidth || 1
      this.h = el.offsetHeight || 1
      this.ro = new ResizeObserver(() => {
        this.w = el.offsetWidth || 1
        this.h = el.offsetHeight || 1
      })
      this.ro.observe(el)
      el.style.opacity = '0'
      el.style.visibility = 'hidden'
    }
  }

  /** active：镜头已基本落定在卷前；进场慢慢浮现，离场迅速隐去 */
  update(camera: Camera, width: number, height: number, active: boolean, dt: number) {
    const el = this.el
    if (!el) return
    const target = active ? 1 : 0
    const rate = active ? 4 : 14
    this.alpha += (target - this.alpha) * Math.min(1, dt * rate)
    if (!active && this.alpha < 0.01) this.alpha = 0

    const visible = this.alpha > 0.001
    if (visible !== this.shown) {
      this.shown = visible
      el.style.visibility = visible ? 'visible' : 'hidden'
      el.toggleAttribute('inert', !visible)
    }
    if (!visible) return
    el.style.opacity = this.alpha.toFixed(3)

    // 四角投影到 CSS 像素；任何一角跑到相机后面就先藏起来
    for (let i = 0; i < 4; i++) {
      this.v.copy(this.corners[i]).project(camera)
      if (this.v.z > 1 || this.v.z < -1) {
        el.style.visibility = 'hidden'
        this.shown = false
        return
      }
      this.pts[i * 2] = (this.v.x * 0.5 + 0.5) * width
      this.pts[i * 2 + 1] = (0.5 - this.v.y * 0.5) * height
    }
    const m = quadMatrix(this.pts, this.w, this.h)
    if (m) el.style.transform = `matrix3d(${m})`
  }

  dispose() {
    this.ro?.disconnect()
  }
}

/**
 * 单位正方形 -> 任意四边形的投影变换（Heckbert），再按 DOM 尺寸缩放，输出 CSS matrix3d 的 16 个数（列主序）。
 * p: [x0,y0, x1,y1, x2,y2, x3,y3] 依次对应 DOM 的 (0,0) (w,0) (w,h) (0,h)
 */
const quadMatrix = (p: Float64Array, w: number, h: number): string | null => {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = p
  const dx1 = x1 - x2
  const dx2 = x3 - x2
  const dx3 = x0 - x1 + x2 - x3
  const dy1 = y1 - y2
  const dy2 = y3 - y2
  const dy3 = y0 - y1 + y2 - y3
  const den = dx1 * dy2 - dx2 * dy1
  if (Math.abs(den) < 1e-9) return null
  const g = (dx3 * dy2 - dx2 * dy3) / den
  const hh = (dx1 * dy3 - dx3 * dy1) / den
  const a = x1 - x0 + g * x1
  const b = x3 - x0 + hh * x3
  const d = y1 - y0 + g * y1
  const e = y3 - y0 + hh * y3
  // 列主序：第一列 (a/w, d/w, 0, g/w)，第二列 (b/h, e/h, 0, hh/h)，第三列 z 轴，第四列平移
  return [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, x0, y0, 0, 1].join(',')
}
