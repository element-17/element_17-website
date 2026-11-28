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
import type { ThemeScheme } from '../config/theme'
import type { WeatherKind } from '../config/weather'
import { Boat, Dock, ShoreProps } from './Boat'
import { Campfire } from './Campfire'
import { CampProps } from './CampProps'
import {
  DAWN_FOG_COLOR,
  DAWN_FOG_DENSITY,
  DAWN_SUN_DIR,
  Environment,
  FOG_COLOR,
  FOG_DENSITY,
  MOON_DIR,
  MOON_DISTANCE,
  SUN_DIR,
} from './Environment'
import { DETAIL_LAYER } from './merge'
import { StarryBackground } from './StarryBackground'
import { StickmanSwordsman } from './StickmanSwordsman'
import { Village } from './Village'
import { WeatherSystem } from './WeatherSystem'

/** 3D 世界：渲染器 + 场景装配 + 昼夜与实时天气融合 + 帧循环 + 画质调度 + 古卷投影与点击交互 */
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
  private weatherSys: WeatherSystem
  private composer: EffectComposer | null = null
  private bloomPass: UnrealBloomPass | null = null
  private fog: THREE.FogExp2
  private village: Village
  private keyLight: THREE.PointLight
  private container: HTMLElement
  private observer: ResizeObserver
  private width = 1
  private height = 1
  private preset: QualityPreset
  private onReady?: () => void
  private onSelect?: (id: ModuleId) => void
  private onToggleTheme?: () => void
  private readyFired = false
  /** 页面不可见时停掉渲染循环，回来再恢复 */
  private paused = false
  /** 昼夜过渡：0 = 黑夜，1 = 黎明（按真实耗时补间，低帧率也能如期落定） */
  private dawn = 0
  private targetDawn = 0
  private dawnAnim: { from: number; to: number; start: number; duration: number } | null = null
  private reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  private nightBg = new THREE.Color(0x05040f)
  private dawnBg = new THREE.Color(0x728bb8)
  private rainNightBg = new THREE.Color(0x0c111e)
  private rainDawnBg = new THREE.Color(0x5c697a)
  private snowNightBg = new THREE.Color(0x181f34)
  private snowDawnBg = new THREE.Color(0x9fb0c8)

  private nightFog = new THREE.Color(FOG_COLOR)
  private dawnFog = new THREE.Color(DAWN_FOG_COLOR)
  private rainNightFog = new THREE.Color(0x1b2236)
  private rainDawnFog = new THREE.Color(0x95a2b2)
  private snowNightFog = new THREE.Color(0x3a4360)
  private snowDawnFog = new THREE.Color(0xd2dce8)
  private curFogColor = new THREE.Color(FOG_COLOR)
  private tmpColor = new THREE.Color()

  private keyNightColor = new THREE.Color(0xc0b4ff)
  private keyDawnColor = new THREE.Color(0xfff1dc)
  private heroFocus = new THREE.Vector3()
  private focusAnchor = new THREE.Vector3()

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
    initialTheme: ThemeScheme,
    initialWeather: WeatherKind = 'clear',
    onReady?: () => void,
    onSelect?: (id: ModuleId) => void,
    onToggleTheme?: () => void,
  ) {
    this.canvas = canvas
    this.container = canvas.parentElement ?? canvas
    this.onReady = onReady
    this.onSelect = onSelect
    this.onToggleTheme = onToggleTheme
    this.preset = QUALITY_PRESETS[quality]
    this.dawn = initialTheme === 'light' ? 1 : 0
    this.targetDawn = this.dawn

    // 主相机同时看默认层(0)与细碎陈设层(DETAIL_LAYER)；中画质倒影相机只看默认层
    this.camera.layers.enable(DETAIL_LAYER)

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality !== 'low',
      powerPreference: 'high-performance',
    })
    this.renderer.shadowMap.enabled = this.preset.shadowMapSize > 0
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.info.autoReset = false

    this.scene.background = new THREE.Color(0x05040f)
    this.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY)
    this.scene.fog = this.fog

    this.sky = new StarryBackground(MOON_DIR, MOON_DISTANCE, SUN_DIR, DAWN_SUN_DIR, FOG_COLOR)
    this.env = new Environment()
    this.fire = new Campfire()
    this.fire.group.position.set(CAMP.fire.x, 0, CAMP.fire.z)

    // 主角：按初始天气自动落位（晴/阴倚石、雨天河畔垂钓、雪天撑红伞立雪）
    this.hero = new StickmanSwordsman()
    this.hero.setModule(initialModule)
    this.hero.setWeather(initialWeather, true)
    this.scene.add(this.hero.group)

    // 营地三件陈设：篝火旁的古卷矮几 / 右后方的铁砧插剑 / 水边的灯杆与信鸽
    this.props = new CampProps()
    this.props.updateHeroInteractCenter(this.hero.getFocusWorldPosition(this.heroFocus))
    this.scene.add(this.props.group)

    // 河上的陈设：泊在月下的乌篷船、对岸小码头、近岸枯木与系船桩
    this.boat = new Boat()
    this.dock = new Dock()
    this.shoreProps = new ShoreProps()
    this.scene.add(this.boat.group, this.dock.group, this.shoreProps.group)

    this.village = new Village()
    this.scene.add(this.village.group)

    // 天气粒子（雨丝、飘雪、水花圈）与气象状态机
    this.weatherSys = new WeatherSystem(initialWeather, this.reduceMotion)
    this.scene.add(this.weatherSys.group)

    // 跟随镜头的柔冷补光
    this.keyLight = new THREE.PointLight(0xc0b4ff, 1.8, 12, 2)
    this.camera.add(this.keyLight)

    this.scene.add(this.sky.group, this.env.group, this.fire.group, this.camera)

    this.applyPresetToSubsystems()
    this.applyAtmosphere()

    this.controller = new SceneTransitionController(this.camera, uiRoot, initialWeather)
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

  setTheme(scheme: ThemeScheme) {
    const next = scheme === 'light' ? 1 : 0
    if (next === this.targetDawn) return
    this.targetDawn = next
    if (this.reduceMotion) {
      this.dawn = next
      this.dawnAnim = null
      this.applyAtmosphere()
      return
    }
    this.dawnAnim = { from: this.dawn, to: next, start: performance.now(), duration: 0.85 }
  }

  setWeather(kind: WeatherKind, options?: { thunder?: boolean; windSpeed?: number }) {
    this.weatherSys.setWeather(kind, options)
    this.hero.setWeather(kind)
    this.props.updateHeroInteractCenter(this.hero.getFocusWorldPosition(this.heroFocus))
    this.controller.setWeather(kind)
  }

  setQuality(id: QualityLevel) {
    const next = QUALITY_PRESETS[id]
    const prevShadows = this.renderer.shadowMap.enabled
    const nextShadows = next.shadowMapSize > 0
    this.preset = next
    this.renderer.shadowMap.enabled = nextShadows
    this.applyPresetToSubsystems()

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
      weather: this.weatherSys.state.kind,
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
    this.weatherSys.applyQuality(this.preset)
  }

  /** 将昼夜与实时天气状态融合到背景、雾效、辉光与天空/环境着色器 */
  private applyAtmosphere() {
    const dawn = this.dawn
    const w = this.weatherSys.state

    const bg = this.scene.background as THREE.Color
    bg.copy(this.nightBg).lerp(this.dawnBg, dawn)
    this.tmpColor.copy(this.rainNightBg).lerp(this.rainDawnBg, dawn)
    bg.lerp(this.tmpColor, w.rain * 0.85)
    this.tmpColor.copy(this.snowNightBg).lerp(this.snowDawnBg, dawn)
    bg.lerp(this.tmpColor, w.snow * 0.78)

    this.curFogColor.copy(this.nightFog).lerp(this.dawnFog, dawn)
    this.tmpColor.copy(this.rainNightFog).lerp(this.rainDawnFog, dawn)
    this.curFogColor.lerp(this.tmpColor, w.rain * 0.82)
    this.tmpColor.copy(this.snowNightFog).lerp(this.snowDawnFog, dawn)
    this.curFogColor.lerp(this.tmpColor, w.snow * 0.78)

    const baseFogDensity = THREE.MathUtils.lerp(FOG_DENSITY, DAWN_FOG_DENSITY, dawn)
    const fogDensity = baseFogDensity * (1 + w.cloudy * 0.25 + w.rain * 0.65 + w.snow * 0.5)
    this.fog.color.copy(this.curFogColor)
    this.fog.density = fogDensity

    this.keyLight.color.copy(this.keyNightColor).lerp(this.keyDawnColor, dawn)
    if (this.bloomPass) {
      this.bloomPass.strength = THREE.MathUtils.lerp(0.42, 0.14, dawn) * (1 - w.rain * 0.35)
      this.bloomPass.threshold = THREE.MathUtils.lerp(0.82, 0.96, dawn)
    }

    this.sky.setDawn(dawn)
    this.sky.setWeather(w.cloudiness, w.rain, w.snow, w.thunderFlash)
    this.env.setAtmosphere(dawn, w, this.curFogColor, fogDensity)
  }

  /** 按需创建辉光后期：低画质下永不分配 4x MSAA HalfFloat 帧缓冲 */
  private ensureComposer() {
    if (this.composer) return this.composer
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
    const composer = new EffectComposer(this.renderer, target)
    composer.addPass(new RenderPass(this.scene, this.camera))
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      THREE.MathUtils.lerp(0.42, 0.14, this.dawn),
      0.75,
      THREE.MathUtils.lerp(0.82, 0.96, this.dawn),
    )
    this.bloomPass = bloom
    composer.addPass(bloom)
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
    this.weatherSys.setPixelRatio(ratio)
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

  private pickTarget(clientX: number, clientY: number): { kind: 'module'; id: ModuleId } | { kind: 'celestial' } | null {
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
    if (best) return { kind: 'module', id: best }

    // 拾取天空中的月亮或黎明朝阳：点击切换昼夜场景
    const celestial = this.sky.getCelestialTarget()
    this.sphere.set(celestial.center, celestial.radius)
    if (this.raycaster.ray.intersectSphere(this.sphere, this.hitPt)) {
      return { kind: 'celestial' }
    }
    return null
  }

  private onPointerDown = (e: PointerEvent) => {
    this.downPos = { x: e.clientX, y: e.clientY }
  }

  private onPointerUp = (e: PointerEvent) => {
    const start = this.downPos
    this.downPos = null
    if (!start) return
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) return
    const hit = this.pickTarget(e.clientX, e.clientY)
    if (!hit) return
    if (hit.kind === 'celestial') {
      this.onToggleTheme?.()
    } else if (this.onSelect) {
      this.onSelect(hit.id)
    }
  }

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return
    const now = performance.now()
    if (now - this.lastHoverAt < 80) return
    this.lastHoverAt = now
    const hit = this.pickTarget(e.clientX, e.clientY)
    this.canvas.style.cursor = hit ? 'pointer' : ''
    this.canvas.title =
      hit?.kind === 'celestial' ? (this.dawn < 0.5 ? '点击月亮切换至黎明场景' : '点击朝阳切换至黑夜场景') : ''
  }

  private tick = (time: number, deltaMs: number) => {
    this.renderer.info.reset()
    const dt = Math.min(deltaMs / 1000, 0.05)
    const { controller } = this
    const { mouse, state } = controller

    // 按真实耗时平滑推进昼夜过渡
    if (this.dawnAnim) {
      const t = Math.min(1, (performance.now() - this.dawnAnim.start) / 1000 / this.dawnAnim.duration)
      const ease = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
      this.dawn = this.dawnAnim.from + (this.dawnAnim.to - this.dawnAnim.from) * ease
      if (t >= 1) {
        this.dawn = this.dawnAnim.to
        this.dawnAnim = null
      }
    }

    controller.update(this.width, this.height)

    // 粒子包围盒以当前注视点与相机中点为锚，保证所有机位都被雨雪均匀包围
    this.focusAnchor.set(
      (state.px + state.tx) * 0.5,
      0,
      (state.pz + state.tz) * 0.5,
    )
    this.weatherSys.update(time, dt, this.dawn, this.focusAnchor)
    this.applyAtmosphere()

    const w = this.weatherSys.state

    // 相机抵达古卷前时让 DOM 墨字缓缓浮现，离开时立刻隐去
    const sheetActive = controller.current === 'blog' && controller.progress > 0.62
    this.sheet.update(this.camera, this.width, this.height, sheetActive, dt)

    // 藏卷近景俯拍时压低随身冷补光；雨天熄火时保留微弱柔光照亮卷面与主角
    const isBlog = controller.current === 'blog'
    const baseKey = THREE.MathUtils.lerp(1.8, 0.85, this.dawn) * (1 + w.rain * 0.25)
    const targetKey = isBlog ? (0.45 + w.rain * 0.55) : baseKey
    this.keyLight.intensity += (targetKey - this.keyLight.intensity) * Math.min(1, dt * 5)
    this.keyLight.position.set(mouse.x * 1.8, 0.9 - mouse.y * 1.0, -0.6)

    this.sky.update(time)
    this.env.update(time, dt)
    this.fire.update(time, state.fire * (1 - this.dawn * 0.52), w.rain, w.snow)
    this.village.update(time, this.dawn, w.rain, w.snow)
    this.props.update(time, this.dawn, w.rain, w.snow, w.wind)
    this.boat.update(time, this.dawn, w.wind, w.snow)
    this.hero.update(time, dt, mouse.x * 0.12, w.wind, w.snow)

    this.renderer.toneMappingExposure = state.exposure * THREE.MathUtils.lerp(1, 0.96, this.dawn)
    if (this.preset.bloom) this.ensureComposer().render()
    else this.renderer.render(this.scene, this.camera)

    // 第一帧真正画出来后通知 UI 收起加载提示
    if (!this.readyFired) {
      this.readyFired = true
      this.onReady?.()
    }
  }
}
