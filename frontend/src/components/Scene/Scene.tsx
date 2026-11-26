import { useEffect, useRef, useState } from 'react'
import type { ModuleId } from '../../config/modules'
import type { QualityLevel } from '../../config/quality'
import type { ThemeScheme } from '../../config/theme'
import type { WeatherKind } from '../../config/weather'
import { World } from '../../scene3d/World'
import './Scene.scss'

interface Props {
  module: ModuleId
  quality: QualityLevel
  theme: ThemeScheme
  weather: WeatherKind
  thunder?: boolean
  windSpeed?: number
  /** 首帧渲染完成后回调 */
  onReady?: () => void
  /** 点击 3D 营地陈设时切到对应章节 */
  onSelectModule?: (id: ModuleId) => void
  /** 点击 3D 天空中的月亮或太阳时切换昼夜场景 */
  onToggleTheme?: () => void
  /** 通知外层是否落入了无 WebGL 兜底画面 */
  onFallbackChange?: (fallback: boolean) => void
}

/** 环境是否提供 WebGL（渲染期即可判定，用于决定是否直接走兜底画面） */
const supportsWebGL = (): boolean => {
  try {
    const probe = document.createElement('canvas')
    return Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'))
  } catch {
    return false
  }
}

/**
 * 场景：一块 WebGL 画布（真 3D 世界）+ 叠在上面的暗角。
 * WebGL 不可用时退化为一张纯 CSS 的兜底画面，自动跟随黎明 / 黑夜主题。
 */
export function Scene({
  module,
  quality,
  theme,
  weather,
  thunder,
  windSpeed,
  onReady,
  onSelectModule,
  onToggleTheme,
  onFallbackChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const worldRef = useRef<World | null>(null)
  const onSelectRef = useRef(onSelectModule)
  const onToggleThemeRef = useRef(onToggleTheme)
  const [fallback, setFallback] = useState(() => !supportsWebGL())

  useEffect(() => {
    onSelectRef.current = onSelectModule
  }, [onSelectModule])

  useEffect(() => {
    onToggleThemeRef.current = onToggleTheme
  }, [onToggleTheme])

  useEffect(() => {
    onFallbackChange?.(fallback)
  }, [fallback, onFallbackChange])

  useEffect(() => {
    if (fallback) {
      onReady?.()
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return
    let world: World
    try {
      world = new World(
        canvas,
        canvas.closest<HTMLElement>('[data-stage]'),
        quality,
        module,
        theme,
        weather,
        onReady,
        (id) => onSelectRef.current?.(id),
        () => onToggleThemeRef.current?.(),
      )
    } catch (err) {
      console.error('WebGL 初始化失败', err)
      queueMicrotask(() => setFallback(true))
      onReady?.()
      return
    }
    worldRef.current = world
    return () => {
      world.dispose()
      worldRef.current = null
    }
    // 画布只需创建一次；quality / module / theme / weather 的后续变化由下面的 effect 接管
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    worldRef.current?.setQuality(quality)
  }, [quality])

  useEffect(() => {
    worldRef.current?.goTo(module)
  }, [module])

  useEffect(() => {
    worldRef.current?.setTheme(theme)
  }, [theme])

  useEffect(() => {
    worldRef.current?.setWeather(weather, { thunder, windSpeed })
  }, [weather, thunder, windSpeed])

  return (
    <div
      className={`scene${fallback ? ' scene--fallback' : ''}`}
      data-weather={weather}
      aria-hidden={!fallback}
    >
      <canvas ref={canvasRef} className="scene__canvas" />
      {fallback && (
        <>
          <div className="scene__fallback-stars" />
          <div className="scene__fallback-glow" />
          <button
            type="button"
            className="scene__fallback-moon"
            style={{ pointerEvents: 'auto' }}
            aria-label={theme === 'dark' ? '点击月亮切换至黎明场景' : '点击太阳切换至黑夜场景'}
            onClick={() => onToggleTheme?.()}
          />
          <div className="scene__fallback-mountains" />
          <div className="scene__fallback-river" />
          <div className="scene__fallback-lights" />
          <div className="scene__fallback-shore" />
          <div className="scene__fallback-weather" aria-hidden="true" />
          <p className="scene__fallback-note">当前环境不支持 WebGL · 文字与导航不受影响</p>
        </>
      )}
      <div className="scene__vignette" data-vignette />
    </div>
  )
}
