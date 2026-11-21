import * as THREE from 'three'
import gsap from 'gsap'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { SceneTransitionController } from '../animation/SceneTransitionController'
import { SheetProjector } from '../animation/SheetProjector'
import type { ModuleId } from '../config/modules'
import type { QualityLevel, QualityPreset } from '../config/quality'
import { QUALITY_PRESETS } from '../config/quality'
import { CAMP } from '../config/shots'
import { Boat, Dock, ShoreProps } from './Boat'
import { Campfire } from './Campfire'
import { CampProps } from './CampProps'
import { Environment, FOG_COLOR, FOG_DENSITY, MOON_DIR, MOON_DISTANCE, SUN_DIR } from './Environment'
import { DETAIL_LAYER } from './merge'
import { StarryBackground } from './StarryBackground'
import { StickmanSwordsman } from './StickmanSwordsman'
import { makeRadialTexture } from './textures'
import { Village } from './Village'

/** 3D 世界：渲染器 + 场景装配 + 帧循环 + 画质调度 + 古卷投影与点击交互 */
export class World {
  private renderer: THREE.WebGLRenderer
  private canvas: HTMLCanvasElement
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1600)
  private controller: SceneTransitionController
  private sheet: SheetProjector
  private sky: StarryBackground
  private env: Environment
  private fire: Campfire
  private hero: StickmanSwordsman
  private props: CampProps
  private boat: Boat
  private dock: Dock
  private shoreProps: ShoreProps
  private composer: EffectComposer | null = null
  private village: Village
  private keyLight: THREE.PointLight
  private container: HTMLElement
  private observer: ResizeObserver
  private width = 1
  private height = 1
  private preset: QualityPreset
  private onReady?: () => void
  private onSelect?: (id: ModuleId) => void
  private readyFired = false
  /** 页面不可见时停掉渲染循环，回来再恢复 */
  private paused = false

  // 轻量点击拾取（仅球体求交，不逐帧跑网格 Raycast）
  private raycaster = new THREE.Raycaster()
  private ndc = new THREE.Vector2()
  private sphere = new THREE.Sphere()
  private hitPt = new THREE.Vector3()
  private downPos: { x: number; y: number } | null = null
  private lastHoverAt = 0

  constructor(
    canvas: HTMLCanvasElement,
    uiRoot: HTMLElement | null,
    quality: QualityLevel,
    /** 初始站点：直接从 hash 进来时，相机第一帧就要落在正确的位置上 */
    initialModule: ModuleId,
    onReady?: () => void,
    onSelect?: (id: ModuleId) => void,
  ) {
    this.canvas = canvas
    this.container = canvas.parentElement ?? canvas
    this.onReady = onReady
    this.onSelect = onSelect
    this.preset = QUALITY_PRESETS[quality]

    // 主相机同时看默认层(0)与细碎陈设层(DETAIL_LAYER)；中画质倒影相机只看默认层
    this.camera.layers.enable(DETAIL_LAYER)

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality !== 'low',
      powerPreference: 'high-performance',
    })
    this.renderer.shadowMap.enabled = this.preset.shadowMapSize > 0
    // PCFSoftShadowMap 自 r186 起废弃（已并入 PCFShadowMap）
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.info.autoReset = false

    this.scene.background = new THREE.Color(0x05040f)
    this.scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY)

    this.sky = new StarryBackground(MOON_DIR, MOON_DISTANCE, SUN_DIR, FOG_COLOR)
    this.env = new Environment()
    this.fire = new Campfire()
    this.fire.group.position.set(CAMP.fire.x, 0, CAMP.fire.z)

    // 主角倚石坐在营地中心
    this.hero = new StickmanSwordsman()
    this.hero.group.position.set(CAMP.hero.x, 0, CAMP.hero.z)
    this.hero.setPose()
    this.hero.setModule(initialModule)
    this.scene.add(this.hero.group)

    // 营地三件陈设：篝火旁的古卷矮几 / 右后方的铁砧插剑 / 水边的灯杆与信鸽
    this.props = new CampProps()
    this.scene.add(this.props.group)

    // 河上的陈设：泊在月下的乌篷船、对岸小码头、近岸枯木与系船桩
    this.boat = new Boat()
    this.dock = new Dock()
    this.shoreProps = new ShoreProps()
    this.scene.add(this.boat.group, this.dock.group, this.shoreProps.group)

    const flameTex = makeRadialTexture([
      [0, 'rgba(255,244,214,1)'],
      [0.25, 'rgba(255,170,70,0.85)'],
      [0.6, 'rgba(230,80,30,0.3)'],
      [1, 'rgba(200,50,20,0)'],
    ])
    this.village = new Village(flameTex)
    this.scene.add(this.village.group)

    // 跟随镜头的柔冷补光：放在镜头附近且亮度克制，避免近景俯拍时把地面或铁砧打出一块强反光
    this.keyLight = new THREE.PointLight(0xc0b4ff, 1.8, 12, 2)
    this.camera.add(this.keyLight)

    this.scene.add(this.sky.group, this.env.group, this.fire.group, this.camera)

    this.applyPresetToSubsystems()

    this.controller = new SceneTransitionController(this.camera, uiRoot)
    this.controller.goTo(initialModule)

    this.sheet = new SheetProjector(
      uiRoot?.querySelector<HTMLElement>('[data-scroll-sheet]') ?? null,
      this.props.sheetCorners,
    )

    this.observer = new ResizeObserver(this.resize)
    this.observer.observe(this.container)
    this.resize()

    canvas.addEventListener('pointerdown', this.onPointerDown, { passive: true })
    canvas.addEventListener('pointerup', this.onPointerUp, { passive: true })
    canvas.addEventListener('pointermove', this.onPointerMove, { passive: true })
    document.addEventListener('visibilitychange', this.onVisibility)
    if (import.meta.env.DEV) (window as unknown as { __world: World }).__world = this

    gsap.ticker.add(this.tick)
    // 先同步画一帧：页面在后台打开时 rAF 不跑，加载提示也能如期收起
    this.tick(0, 16)
  }

  goTo(id: ModuleId) {
    this.controller.goTo(id)
    this.hero.setModule(id)
  }

  setQuality(id: QualityLevel) {
    const next = QUALITY_PRESETS[id]
    const prevShadows = this.renderer.shadowMap.enabled
    const nextShadows = next.shadowMapSize > 0
    this.preset = next
    this.renderer.shadowMap.enabled = nextShadows
    this.applyPresetToSubsystems()

    // 阴影开关在运行时切换后，需要让受影材质重新编译着色器
    if (prevShadows !== nextShadows) {
      this.scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (!mesh.material) return
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const mat of mats) mat.needsUpdate = true
      })
    }
    this.resize()
  }

  /** 调试：一帧的绘制统计（含倒影、阴影、后期的全部 pass） */
  debugInfo() {
    let lights = 0
    this.scene.traverseVisible((o) => {
      if ((o as THREE.PointLight).isPointLight) lights++
    })
    const { render, programs } = this.renderer.info
    return {
      calls: render.calls,
      triangles: render.triangles,
      programs: programs?.length,
      pointLights: lights,
      pixelRatio: this.renderer.getPixelRatio(),
    }
  }

  dispose() {
    gsap.ticker.remove(this.tick)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.observer.disconnect()
    this.controller.destroy()
    this.sheet.dispose()
    this.hero.dispose()
    this.env.dispose()
    this.composer?.dispose()
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      mesh.geometry?.dispose()
      const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
      for (const mat of materials) {
        ;(mat as THREE.MeshBasicMaterial).map?.dispose()
        mat.dispose()
      }
      const light = obj as THREE.DirectionalLight
      if (light.isLight) light.shadow?.map?.dispose()
    })
    this.renderer.dispose()
  }

  private applyPresetToSubsystems() {
    this.env.applyQuality(this.preset)
    this.sky.applyQuality(this.preset)
    this.village.applyQuality(this.preset)
  }

  /** 按需创建辉光后期：低画质下永不分配 4x MSAA HalfFloat 帧缓冲 */
  private ensureComposer() {
    if (this.composer) return this.composer
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
    const composer = new EffectComposer(this.renderer, target)
    composer.addPass(new RenderPass(this.scene, this.camera))
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.75, 0.82))
    composer.addPass(new OutputPass())
    this.composer = composer
    return composer
  }

  private resize = () => {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.width = w
    this.height = h
    const ratio = Math.min(window.devicePixelRatio || 1, this.preset.pixelRatio)
    this.renderer.setPixelRatio(ratio)
    this.renderer.setSize(w, h, false)
    if (this.preset.bloom) {
      const composer = this.ensureComposer()
      composer.setPixelRatio(ratio)
      composer.setSize(w, h)
    }
    this.sky.setPixelRatio(ratio)
    this.env.setReflectionSize(w * this.preset.reflection, h * this.preset.reflection)
  }

  private onVisibility = () => {
    if (document.hidden && !this.paused) {
      this.paused = true
      gsap.ticker.remove(this.tick)
    } else if (!document.hidden && this.paused) {
      this.paused = false
      gsap.ticker.add(this.tick)
    }
  }

  private pickProp(clientX: number, clientY: number): ModuleId | null {
    const rect = this.canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.ndc, this.camera)
    let best: ModuleId | null = null
    let bestDist = Infinity
    for (const z of this.props.interactZones) {
      if (z.id === this.controller.current) continue
      this.sphere.set(z.center, z.radius)
      if (this.raycaster.ray.intersectSphere(this.sphere, this.hitPt)) {
        const d = this.camera.position.distanceToSquared(this.hitPt)
        if (d < bestDist) {
          bestDist = d
          best = z.id
        }
      }
    }
    return best
  }

  private onPointerDown = (e: PointerEvent) => {
    this.downPos = { x: e.clientX, y: e.clientY }
  }

  private onPointerUp = (e: PointerEvent) => {
    const start = this.downPos
    this.downPos = null
    if (!start || !this.onSelect) return
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) return
    const hit = this.pickProp(e.clientX, e.clientY)
    if (hit) this.onSelect(hit)
  }

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return
    const now = performance.now()
    if (now - this.lastHoverAt < 80) return
    this.lastHoverAt = now
    this.canvas.style.cursor = this.pickProp(e.clientX, e.clientY) ? 'pointer' : ''
  }

  private tick = (time: number, deltaMs: number) => {
    this.renderer.info.reset()
    const dt = Math.min(deltaMs / 1000, 0.05)
    const { controller } = this
    const { mouse, state } = controller

    controller.update(this.width, this.height)

    // 相机抵达古卷前时让 DOM 墨字缓缓浮现，离开时立刻隐去
    const sheetActive = controller.current === 'blog' && controller.progress > 0.62
    this.sheet.update(this.camera, this.width, this.height, sheetActive, dt)

    // 藏卷近景俯拍时压低随身冷补光，把古卷彻底交给篝火暖光
    const isBlog = controller.current === 'blog'
    this.keyLight.intensity += ((isBlog ? 0.45 : 1.8) - this.keyLight.intensity) * Math.min(1, dt * 5)
    this.keyLight.position.set(mouse.x * 1.8, 0.9 - mouse.y * 1.0, -0.6)
    this.sky.update(time)
    this.env.update(time, dt)
    this.fire.update(time, state.fire)
    this.village.update(time)
    this.props.update(time)
    this.boat.update(time)
    this.hero.update(time, dt, mouse.x * 0.12)

    this.renderer.toneMappingExposure = state.exposure
    if (this.preset.bloom) this.ensureComposer().render()
    else this.renderer.render(this.scene, this.camera)

    // 第一帧真正画出来后通知 UI 收起加载提示
    if (!this.readyFired) {
      this.readyFired = true
      this.onReady?.()
    }
  }
}
